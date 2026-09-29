import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { COMPANY, DEMO_FIRST_QUESTION, DEMO_SIMILAR_QUESTION, DEMO_TOPICS } from '../brand'
import { greetingFor, type SupportIdentity } from '../session'
import type { ResolutionChoice, SupportMessage } from '../types'
import { InlineNotice } from './States'

interface Props {
  identity: SupportIdentity
  onSignOut: () => void
}

/**
 * Customer support conversation.
 *
 * This view deliberately has no access to organizational memory: the API layer
 * narrows every agent response to the customer-safe projection, and nothing here
 * renders memories, reasoning, document ids, or organization-wide data. A customer
 * sees a helpful answer and nothing else.
 */
export default function SupportChat({ identity, onSignOut }: Props) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [lastResolved, setLastResolved] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || sending) return

    const customerMessage: SupportMessage = {
      id: `c-${Date.now()}`,
      role: 'customer',
      text: message,
      at: Date.now(),
    }
    const pending: SupportMessage = {
      id: `a-${Date.now()}`,
      role: 'agent',
      text: '',
      at: Date.now(),
      pending: true,
      resolution: null,
    }
    setMessages((prev) => [...prev, customerMessage, pending])
    setDraft('')
    setSending(true)
    setNotice(null)

    try {
      const reply = await api.support(identity.name, message, identity.email)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pending.id ? { ...m, text: reply.response, pending: false, failed: false } : m,
        ),
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pending.id
            ? {
                ...m,
                text: 'EchoMind could not complete that request. Please try again in a moment.',
                pending: false,
                failed: true,
                resolution: null,
              }
            : m,
        ),
      )
      setNotice(detail)
    } finally {
      setSending(false)
      composerRef.current?.focus()
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
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
      setLastResolved(result.retained ? result.document_id : null)
      setNotice(
        result.retained
          ? 'Thanks — that outcome is now part of what EchoMind knows. A future customer with a similar question will get an answer informed by it.'
          : 'Thanks. The outcome could not be stored just now, so it will not inform future answers.',
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setResolving(null)
    }
  }

  const lastAgentId = [...messages].reverse().find((m) => m.role === 'agent')?.id ?? null
  const canAskFollowUp = messages.length > 0 && !sending

  return (
    <div className="support-shell">
      <div className="support-main">
        <div className="chat-head">
          <div className="chat-agent">
            <span className="agent-avatar" aria-hidden="true">
              EM
            </span>
            <div>
              <p className="chat-agent-name">
                {COMPANY.supportAgent}
                <span className="chat-agent-role">AI support agent</span>
              </p>
              <p className="chat-agent-status">
                {COMPANY.name} customer support · typically replies instantly
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
            End session
          </button>
        </div>

        <div className="chat-scroll" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <h2>
                {greetingFor(identity.name)} <span aria-hidden="true">👋</span>
              </h2>
              <p>
                I&apos;m {COMPANY.supportAgent}, {COMPANY.name}&apos;s support agent. Ask me
                about our products, your workspace, or anything you&apos;re stuck on, and
                I&apos;ll help.
              </p>
              <p className="chat-welcome-note">
                I remember what has worked for {COMPANY.name} before, so my answers get
                more specific the more cases we handle together.
              </p>
              <div className="chat-suggestions">
                <p className="chat-suggestions-label">Try asking</p>
                <ul>
                  {DEMO_TOPICS.slice(0, 5).map((topic) => (
                    <li key={topic.id}>
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => setDraft(topic.questions[0])}
                      >
                        {topic.questions[0]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <ol className="chat-thread">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={`msg msg-${message.role}${message.failed ? ' msg-failed' : ''}`}
                >
                  <div className="msg-meta">
                    <span className="msg-author">
                      {message.role === 'customer' ? identity.name : COMPANY.supportAgent}
                    </span>
                    <span className="msg-role">
                      {message.role === 'customer' ? 'Customer' : 'Support agent'}
                    </span>
                  </div>
                  <div className="msg-bubble">
                    {message.pending ? (
                      <span className="typing" aria-label="EchoMind is typing">
                        <span aria-hidden="true" />
                        <span aria-hidden="true" />
                        <span aria-hidden="true" />
                      </span>
                    ) : (
                      message.text
                    )}
                  </div>
                  {!message.pending && message.role === 'agent' && (
                    <div className="msg-actions">
                      {message.resolution ? (
                        <span className="msg-resolution">
                          {message.resolution === 'resolved'
                            ? 'Marked as resolved — saved to what EchoMind knows'
                            : 'Marked as still blocked — saved so the next agent tries something else'}
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
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="chat-input">
            Message {COMPANY.supportAgent}
          </label>
          <textarea
            id="chat-input"
            ref={composerRef}
            rows={2}
            value={draft}
            placeholder={`Ask ${COMPANY.supportAgent} a question…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            disabled={sending}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className="chat-footnote">
          {COMPANY.supportAgent} can make mistakes. For anything urgent or sensitive,
          please reach a human at{' '}
          <a href="mailto:support@example.com">support@example.com</a>.
        </p>
      </div>

      <aside className="support-aside">
        <section className="panel">
          <h2 className="panel-title">Your session</h2>
          <dl className="kv">
            <div>
              <dt>Name</dt>
              <dd>{identity.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{identity.email}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>{COMPANY.supportAgent}</dd>
            </div>
          </dl>
          <p className="panel-note">
            No account or password needed. Your email is only used to keep this support
            session traceable — it is never stored as part of what {COMPANY.name} learns.
          </p>
        </section>

        <section className="panel">
          <h2 className="panel-title">What I can help with</h2>
          <ul className="topic-list">
            {DEMO_TOPICS.map((topic) => (
              <li key={topic.id}>
                <span className="topic-name">{topic.product}</span>
                <span className="topic-category">{topic.category}</span>
              </li>
            ))}
          </ul>
          <p className="panel-note">
            Product details in this demo are simulated for the {COMPANY.product}{' '}
            demonstration.
          </p>
        </section>

        <section className="panel panel-demo">
          <h2 className="panel-title">See the memory effect</h2>
          <ol className="mini-steps">
            <li>
              <button
                type="button"
                className="link-button"
                onClick={() => setDraft(DEMO_FIRST_QUESTION)}
                disabled={!canAskFollowUp}
              >
                Ask the export question
              </button>
            </li>
            <li>Mark the answer resolved, or use the resolution bar above</li>
            <li>
              <button
                type="button"
                className="link-button"
                onClick={() => setDraft(DEMO_SIMILAR_QUESTION)}
                disabled={!canAskFollowUp}
              >
                Then ask a near-identical question
              </button>
            </li>
          </ol>
          <p className="panel-note">
            The second answer draws on the first case. {COMPANY.name}&apos;s own
            experience, not a guess.
          </p>
        </section>

        {notice && <InlineNotice tone={lastResolved ? 'success' : 'info'}>{notice}</InlineNotice>}
        {lastResolved && (
          <p className="panel-note panel-note-quiet">
            Stored as organizational experience <code>{lastResolved}</code>. Thridha Labs
            staff can see it in the Organization view.
          </p>
        )}
      </aside>
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
