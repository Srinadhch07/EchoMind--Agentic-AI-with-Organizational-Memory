import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, api } from '../api'
import { COMPANY } from '../brand'
import type { SupportIdentity } from '../session'
import type { ResolutionChoice, SupportMessage } from '../types'
import { Markdown } from './Markdown'

interface Props {
  identity: SupportIdentity
  onSignOut: () => void
}

/**
 * The only error text a customer is ever shown.
 *
 * The API layer builds rich messages for the administrator ("Backend responded
 * 502: Hindsight said ..."), which is right for the console and wrong here. A
 * customer needs to know the request failed and that they can try again, not
 * which service rejected it. The original error goes to the browser console,
 * where a developer can still see it, and never to the screen.
 */
const REQUEST_FAILED = 'Something went wrong while processing your request. Please try again.'

/**
 * Customer-safe wording for a failed feedback save, chosen by failure class.
 *
 * The classes are distinguished because the remedies differ and telling someone
 * the wrong one is worse than saying nothing. A connection problem needs a
 * different action from a rejection from our side; a rejected submission cannot
 * be fixed by retrying, so it asks for a new description instead of inviting the
 * customer to try again forever; and an upstream storage problem is temporary by
 * nature, so it is reported as temporary rather than as our own fault. No
 * upstream wording reaches the screen: status 502 is a storage fault here by
 * definition, and the detail is in the console instead.
 */
function outcomeErrorText(err: unknown): string {
  const status = err instanceof ApiError ? err.status : undefined

  if (status === 0) {
    return 'We could not reach EchoMind, so your feedback was not saved. Check your connection and try again.'
  }
  if (status === 422) {
    return 'That feedback was too short or too long to save. Please add a little more detail and try again.'
  }
  if (status === 502) {
    return 'Your feedback could not be stored just now. It was not saved, so please try again in a moment.'
  }
  return 'Something went wrong while saving your feedback, so it was not saved. Please try again.'
}

/** Generic starting points. They describe categories, not catalogue entries. */
const EXAMPLE_PROMPTS = [
  'I need help with my account',
  'How do I export my data?',
  "I'm having trouble with a feature",
]

/**
 * EchoMind customer support conversation.
 *
 * This view deliberately has no access to organizational memory internals: the
 * API layer narrows every agent response to the customer-safe projection, and
 * nothing here renders memories, reasoning, document ids, scores, or
 * organization-wide data. A customer sees a formatted answer and a plain-language
 * note that prior experience informed it.
 *
 * Customer messages render as literal text on purpose. When someone types
 * `**not bold**`, they typed those characters, so showing exactly what they
 * typed is correct. Agent replies are rendered as Markdown, because the agent
 * chooses that formatting rather than the customer.
 */
export default function SupportChat({ identity, onSignOut }: Props) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  /**
   * Feedback about the last action. The tone carries the outcome, so the strip
   * never has to infer "did it work?" from a separate flag, and no storage
   * identifier is ever held in component state.
   */
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  )
  const endRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  /**
   * Grow the composer with its content, up to the height the stylesheet allows.
   *
   * A fixed two-row box wastes a line on a short question and still clips a long
   * one, and a textarea that scrolls internally is awkward on a phone. Running
   * from `draft` rather than from the change handler means a suggestion chip and
   * the Enter key both resize the field too.
   */
  useEffect(() => {
    const field = composerRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [draft])

  /** Ask EchoMind and settle the reply into the message slot it owns. */
  const requestReply = async (messageId: string, question: string) => {
    setSending(true)
    try {
      const reply = await api.support(identity.name, question, identity.email)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text: reply.response,
                pending: false,
                failed: false,
                memoryCount: reply.memoryCount,
              }
            : m,
        ),
      )
    } catch (err) {
      // Kept in the console, not the UI: this is the one place the technical
      // detail is allowed to exist.
      console.error('EchoMind support request failed', err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: REQUEST_FAILED, pending: false, failed: true, resolution: null }
            : m,
        ),
      )
      setNotice({ tone: 'error', text: REQUEST_FAILED })
    } finally {
      setSending(false)
      composerRef.current?.focus()
    }
  }

  const send = (text: string) => {
    const question = text.trim()
    if (!question || sending) return

    const customerMessage: SupportMessage = {
      id: `c-${Date.now()}`,
      role: 'customer',
      text: question,
      at: Date.now(),
    }
    const pending: SupportMessage = {
      id: `a-${Date.now()}`,
      role: 'agent',
      text: '',
      at: Date.now(),
      pending: true,
      resolution: null,
      /**
       * How many prior experiences shaped this answer. Recorded as a plain
       * number only. The memory texts, document ids and relevance scores stay on
       * the server and are never sent to the browser.
       */
      memoryCount: 0,
    }

    setMessages((prev) => [...prev, customerMessage, pending])
    setDraft('')
    setSending(true)
    setNotice(null)
    void requestReply(pending.id, question)
  }

  /**
   * Re-send a failed question into the same reply slot.
   *
   * The customer's original message is reused rather than duplicated, so a
   * second failure cannot leave three copies of one question in the thread.
   */
  const retry = (messageId: string, question: string) => {
    if (!question || sending) return
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, text: '', pending: true, failed: false, memoryCount: 0 }
          : m,
      ),
    )
    setNotice(null)
    void requestReply(messageId, question)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
  }

  const resolve = async (
    agentMessageId: string,
    choice: ResolutionChoice,
    note: string,
  ) => {
    setResolving(agentMessageId)
    const problem = [...messages].reverse().find((m) => m.role === 'customer')?.text ?? ''
    const lesson =
      choice === 'resolved'
        ? note.trim() ||
          `EchoMind's answer resolved this request for ${identity.name}: ${problem}`
        : `Still unresolved after EchoMind's answer: ${problem}${note.trim() ? ` — ${note.trim()}` : ''}`

    try {
      const result = await api.recordOutcome({
        customer: identity.name,
        email: identity.email,
        lesson,
        scenario: `Thridha Labs support case (${choice})`,
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMessageId ? { ...m, resolution: choice } : m)),
      )
      // A boolean from the API, not the storage id. The document id stays on the
      // server; the customer is told their feedback was saved, which is the
      // useful part.
      setNotice(
        result.retained
          ? {
              tone: 'success',
              text: "Thanks — that outcome is now part of what EchoMind knows, so a future customer with a similar question will get an answer informed by it.",
            }
          : {
              tone: 'error',
              text: 'Thanks for the feedback. It could not be stored just now, so it will not inform future answers.',
            },
      )
    } catch (err) {
      // The technical reason (status, upstream Hindsight message, body) goes to
      // the console only. What the customer reads is chosen by failure class, so
      // a dropped connection is never reported as a server fault, and an
      // upstream storage problem is never reported as something they did wrong.
      console.error('EchoMind could not record the support outcome', err)
      setNotice({ tone: 'error', text: outcomeErrorText(err) })
    } finally {
      setResolving(null)
    }
  }

  const lastAgentId = [...messages].reverse().find((m) => m.role === 'agent')?.id ?? null

  /**
   * The customer question an agent reply answers.
   *
   * The thread is a flat list of alternating messages, so the question belonging
   * to a reply is the nearest customer message above it. Used only by retry.
   */
  const questionFor = (index: number): string => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'customer') return messages[i].text
    }
    return ''
  }

  return (
    <div className="support-shell">
      <div className="support-main">
        <header className="chat-head">
          <span className="agent-avatar chat-avatar" aria-hidden="true">
            EM
          </span>
          <div className="chat-head-id">
            <p className="chat-agent-name">{COMPANY.supportAgent}</p>
            <p className="chat-agent-role">AI Customer Support</p>
          </div>
          <p className="chat-head-brand">{COMPANY.name}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm chat-end-session"
            onClick={onSignOut}
            aria-label="End session"
          >
            {/* Two labels rather than an icon: the control stays a readable
                word at every width, and aria-label keeps the full phrase as the
                accessible name when the short one is showing. */}
            <span className="chat-end-long">End session</span>
            <span className="chat-end-short">End</span>
          </button>
        </header>

        <div className="chat-scroll">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <h2>How can {COMPANY.supportAgent} help?</h2>
              <p>
                Ask about a product, service, account issue, or anything you need help
                with.
              </p>
              <div className="chat-suggestions">
                <p className="chat-suggestions-label">Try asking</p>
                <ul>
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <li key={prompt}>
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => {
                          setDraft(prompt)
                          composerRef.current?.focus()
                        }}
                      >
                        {prompt}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            /* role="log" announces one new message at a time. A live region on
               the scroll container would re-announce the whole thread. */
            <ol className="chat-thread" role="log" aria-live="polite" aria-label="Conversation">
              {messages.map((message, index) => {
                const isAgent = message.role === 'agent'
                return (
                  <li
                    key={message.id}
                    className={`msg msg-${message.role}${message.failed ? ' msg-failed' : ''}`}
                  >
                    {isAgent && (
                      <p className="msg-byline">
                        <span className="msg-avatar" aria-hidden="true">
                          EM
                        </span>
                        {COMPANY.supportAgent}
                      </p>
                    )}

                    <div
                      className={`msg-bubble ${
                        isAgent ? 'msg-bubble-agent' : 'msg-bubble-customer'
                      }`}
                    >
                      {message.pending ? (
                        <span
                          className="typing"
                          role="status"
                          aria-label={`${COMPANY.supportAgent} is replying`}
                        >
                          <span aria-hidden="true" />
                          <span aria-hidden="true" />
                          <span aria-hidden="true" />
                        </span>
                      ) : message.failed ? (
                        // Our own wording, not the agent's, so it is not parsed
                        // as Markdown.
                        <span className="msg-plain">{message.text}</span>
                      ) : isAgent ? (
                        <Markdown>{message.text}</Markdown>
                      ) : (
                        // The customer's own text, shown exactly as typed. If
                        // someone writes *asterisks* they meant the asterisks.
                        <span className="msg-plain">{message.text}</span>
                      )}
                    </div>

                    {message.failed && (
                      <button
                        type="button"
                        className="btn btn-soft btn-sm msg-retry"
                        onClick={() => retry(message.id, questionFor(index))}
                      >
                        Try again
                      </button>
                    )}

                    {/* A plain-language note that previous experience was applied.
                        Shown as a count, never as memory text, ids or scores. */}
                    {!message.pending &&
                      !message.failed &&
                      isAgent &&
                      !!message.memoryCount && (
                        <p className="msg-memory">
                          <span className="msg-memory-mark" aria-hidden="true">
                            &bull;
                          </span>
                          Informed by {message.memoryCount}{' '}
                          {message.memoryCount === 1
                            ? 'previous support case'
                            : 'previous support cases'}{' '}
                          from {COMPANY.name}&apos;s experience.
                        </p>
                      )}

                    {!message.pending && !message.failed && isAgent && (
                      <div className="msg-actions">
                        {message.resolution ? (
                          <span className="msg-resolution">
                            {message.resolution === 'resolved'
                              ? 'Marked as resolved'
                              : 'Marked as still blocked'}
                          </span>
                        ) : (
                          <ResolutionBar
                            messageId={message.id}
                            isLast={message.id === lastAgentId}
                            busy={resolving === message.id}
                            onResolve={resolve}
                          />
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        {notice && (
          <p className={`chat-notice chat-notice-${notice.tone}`} role="status">
            {notice.text}
          </p>
        )}

        <form className="chat-composer" onSubmit={onSubmit}>
          <div className="composer-field">
            <label className="sr-only" htmlFor="chat-input">
              Message {COMPANY.supportAgent}
            </label>
            <textarea
              id="chat-input"
              ref={composerRef}
              rows={1}
              value={draft}
              placeholder={`Ask ${COMPANY.supportAgent} about your issue…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              disabled={sending}
            />
            <button
              type="submit"
              className="composer-send"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                <path
                  d="M3.4 10h11.3m0 0-4.4-4.4M14.7 10l-4.4 4.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
        <p className="chat-footnote">Powered by organizational memory</p>
      </div>
    </div>
  )
}

function ResolutionBar({
  messageId,
  isLast,
  busy,
  onResolve,
}: {
  messageId: string
  isLast: boolean
  busy: boolean
  onResolve: (id: string, choice: ResolutionChoice, note: string) => Promise<void>
}) {
  const [choice, setChoice] = useState<ResolutionChoice | null>(null)
  const [note, setNote] = useState('')

  if (!isLast) {
    return (
      <button
        type="button"
        className="link-button link-button-muted"
        onClick={() => onResolve(messageId, 'resolved', '')}
        disabled={busy}
      >
        Mark this as resolved
      </button>
    )
  }

  if (choice === null) {
    return (
      <div className="resolution">
        <p className="resolution-question">Did that resolve your issue?</p>
        <div className="resolution-actions">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => setChoice('resolved')}
          >
            Yes, resolved
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setChoice('unresolved')}
          >
            No, still stuck
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="resolution"
      onSubmit={(e) => {
        e.preventDefault()
        void onResolve(messageId, choice, note)
      }}
    >
      <label className="resolution-label" htmlFor={`note-${messageId}`}>
        {choice === 'resolved'
          ? 'Optional: what actually fixed it?'
          : 'Optional: what are you still hitting?'}
      </label>
      <textarea
        id={`note-${messageId}`}
        rows={2}
        value={note}
        placeholder={
          choice === 'resolved'
            ? 'e.g. The standard CSV export timed out. A background batched export worked.'
            : 'e.g. Still timing out after 20 minutes.'
        }
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="resolution-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save outcome'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setChoice(null)
            setNote('')
          }}
        >
          Cancel
        </button>
      </div>
      <p className="resolution-note">
        {COMPANY.name} uses this outcome so the next customer with a similar problem gets a
        better answer.
      </p>
    </form>
  )
}
