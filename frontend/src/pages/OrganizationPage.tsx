import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { COMPANY, DEMO_DISCLAIMER } from '../brand'
import {
  deriveSignals,
  formatWhen,
  isOutcomeEntry,
  memoryTotals,
  parseExperience,
} from '../lib/experiences'
import type { LearnedResponse, TimelineEntry, TimelineResponse } from '../types'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { FlowDiagram, PageIntro } from '../components/Shell'

export default function OrganizationPage() {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [loadingTimeline, setLoadingTimeline] = useState(true)

  const [learned, setLearned] = useState<LearnedResponse | null>(null)
  const [learnedError, setLearnedError] = useState<string | null>(null)
  const [loadingLearned, setLoadingLearned] = useState(false)
  const [learnedLoaded, setLearnedLoaded] = useState(false)

  /**
   * The mount effect drives the first read through this cancellable path so that no
   * state is written synchronously during the effect, and so an in-flight read
   * cannot write into an unmounted page.
   */
  const readTimeline = useCallback(async (token: { cancelled: boolean }) => {
    try {
      const data = await api.timeline()
      if (token.cancelled) return
      setTimeline(data)
      setTimelineError(null)
    } catch (err) {
      if (token.cancelled) return
      setTimelineError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  /** Manual refresh from the toolbar. */
  const refreshTimeline = useCallback(async () => {
    setLoadingTimeline(true)
    setTimelineError(null)
    await readTimeline({ cancelled: false })
    setLoadingTimeline(false)
  }, [readTimeline])

  const loadLearned = useCallback(async () => {
    setLoadingLearned(true)
    setLearnedError(null)
    try {
      setLearned(await api.learned())
      setLearnedLoaded(true)
    } catch (err) {
      setLearnedError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingLearned(false)
    }
  }, [])

  useEffect(() => {
    const token = { cancelled: false }
    const start = async () => {
      await readTimeline(token)
      if (!token.cancelled) setLoadingTimeline(false)
    }
    void start()
    return () => {
      token.cancelled = true
    }
  }, [readTimeline])

  const entries: TimelineEntry[] = timeline?.entries ?? []
  const totals = memoryTotals(entries)
  const signals = deriveSignals(entries)

  return (
    <div className="page page-org">
      <PageIntro
        eyebrow={`${COMPANY.name} &middot; internal`}
        title="Organization Intelligence"
        lede="See what EchoMind is learning from customer interactions. Internal view for the support and operations team."
      >
        <div className="org-toolbar">
          <span className="org-bank">
            Memory bank <code>{timeline?.bank_id ?? '...'}</code>
          </span>
          <div className="org-toolbar-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void refreshTimeline()}
              disabled={loadingTimeline}
            >
              {loadingTimeline ? 'Refreshing...' : 'Refresh memory'}
            </button>
          </div>
        </div>
      </PageIntro>

      <section className="panel panel-flow">
        <h2 className="panel-title">EchoMind organization memory</h2>
        <p className="panel-note">
          Every customer interaction becomes an experience. Once its outcome is known it
          becomes organizational memory, and the next support agent starts from it.
        </p>
        <FlowDiagram variant="organization" />
      </section>

      <section className="stat-row" aria-label="Organizational memory totals">
        <StatCard
          label="Customer interactions"
          value={totals.experiences}
          pending={loadingTimeline}
        />
        <StatCard label="Outcomes recorded" value={totals.outcomes} pending={loadingTimeline} />
        <StatCard label="Lessons in memory" value={totals.lessons} pending={loadingTimeline} />
        <StatCard label="Customers involved" value={totals.customers} pending={loadingTimeline} />
      </section>

      <div className="org-two-col">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">What EchoMind has learned</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void loadLearned()}
              disabled={loadingLearned}
            >
              {loadingLearned
                ? 'Thinking...'
                : learnedLoaded
                  ? 'Re-summarise'
                  : 'Summarise memory'}
            </button>
          </div>
          {loadingLearned && <Loading label="Reading organizational memory..." />}
          {learnedError && (
            <ErrorState message={learnedError} onRetry={() => void loadLearned()} />
          )}
          {!loadingLearned && !learnedError && learned?.summary && (
            <div className="learned-body">
              <p className="learned-summary">{learned.summary}</p>
              <p className="panel-note">
                Synthesised from {learned.memory_count} stored{' '}
                {learned.memory_count === 1 ? 'experience' : 'experiences'} by{' '}
                {COMPANY.supportAgent}. It states only what the stored experiences support.
              </p>
            </div>
          )}
          {!loadingLearned && !learnedError && learned && !learned.summary && (
            <EmptyState title="Nothing to summarise yet">
              Organizational memory is empty. Once a support interaction has been stored,
              EchoMind can summarise what the organization has learned.
            </EmptyState>
          )}
          {!loadingLearned && !learnedError && !learned && (
            <EmptyState
              title="No summary generated in this session"
              action={
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => void loadLearned()}
                >
                  Summarise memory
                </button>
              }
            >
              Summarisation reads stored organizational memory through the agent, so it runs
              on request rather than on every page load.
            </EmptyState>
          )}
        </section>

        <OutcomeLogger onRecorded={refreshTimeline} />
      </div>

      <section className="panel">
        <h2 className="panel-title">Customer signals</h2>
        <p className="panel-note">
          Recurring themes counted directly from stored experience text. Each count is the
          number of stored experiences that mention the theme.
        </p>
        {loadingTimeline ? (
          <Loading label="Reading stored experiences..." />
        ) : timelineError ? (
          <ErrorState message={timelineError} onRetry={() => void refreshTimeline()} />
        ) : signals.length === 0 ? (
          <EmptyState title="No recurring themes detected yet">
            Signals appear once organizational memory contains real support experiences.
          </EmptyState>
        ) : (
          <ul className="signal-grid">
            {signals.slice(0, 6).map((signal) => (
              <li className="signal" key={signal.label}>
                <div className="signal-head">
                  <span className="signal-label">{signal.label}</span>
                  <span className="signal-count">
                    {signal.count} {signal.count === 1 ? 'experience' : 'experiences'}
                  </span>
                </div>
                <ul className="signal-evidence">
                  {signal.evidence.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Recent experiences</h2>
        <p className="panel-note">
          Newest first. Interaction entries record what EchoMind recommended; outcome
          entries record what actually happened.
        </p>
        {loadingTimeline ? (
          <Loading label="Reading stored experiences..." />
        ) : timelineError ? (
          <ErrorState message={timelineError} onRetry={() => void refreshTimeline()} />
        ) : entries.length === 0 ? (
          <EmptyState title="No experiences stored yet">
            Ask EchoMind a question from the customer support view, then record the
            outcome. The experience will appear here and become memory for the next
            customer.
          </EmptyState>
        ) : (
          <div className="experience-grid">
            {entries.slice(0, 6).map((entry) => (
              <ExperienceCard entry={entry} key={entry.id} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Memory timeline</h2>
        <p className="panel-note">
          Chronological record of organizational memory, newest first.
        </p>
        {loadingTimeline ? (
          <Loading label="Reading stored experiences..." />
        ) : timelineError ? (
          <ErrorState message={timelineError} onRetry={() => void refreshTimeline()} />
        ) : entries.length === 0 ? (
          <EmptyState title="The timeline is empty">
            Every retained experience is timestamped, so this is the auditable history of
            what Thridha Labs has learned.
          </EmptyState>
        ) : (
          <ol className="org-timeline">
            {entries.map((entry) => {
              const outcome = isOutcomeEntry(entry)
              const { problem, action } = parseExperience(entry.lessons)
              return (
                <li className="org-tl-item" key={entry.id}>
                  <span
                    className={`org-tl-dot${outcome ? ' org-tl-dot-outcome' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="org-tl-body">
                    <div className="org-tl-meta">
                      <span className={`tag ${outcome ? 'tag-outcome' : 'tag-interaction'}`}>
                        {outcome ? 'outcome recorded' : 'interaction'}
                      </span>
                      <span className="org-tl-when">{formatWhen(entry.occurred_at)}</span>
                      <span className="org-tl-customer">{entry.customer}</span>
                    </div>
                    <p className="org-tl-text">{problem || action}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <p className="disclaimer-line">{DEMO_DISCLAIMER}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  pending,
}: {
  label: string
  value: number
  pending: boolean
}) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{pending ? '-' : value}</p>
      <p className="stat-source">from stored memory</p>
    </div>
  )
}

function ExperienceCard({ entry }: { entry: TimelineEntry }) {
  const outcome = isOutcomeEntry(entry)
  const { problem, action } = parseExperience(entry.lessons)

  return (
    <article className="experience">
      <div className="experience-head">
        <span className={`tag ${outcome ? 'tag-outcome' : 'tag-interaction'}`}>
          {outcome ? 'Outcome' : 'Interaction'}
        </span>
        <span className="experience-when">{formatWhen(entry.occurred_at)}</span>
      </div>
      <dl className="experience-body">
        <div>
          <dt>Problem</dt>
          <dd>{problem || '-'}</dd>
        </div>
        <div>
          <dt>{outcome ? 'Lesson' : 'Action'}</dt>
          <dd>{action || '-'}</dd>
        </div>
      </dl>
      <p className="experience-customer">{entry.customer}</p>
    </article>
  )
}

function OutcomeLogger({ onRecorded }: { onRecorded: () => Promise<void> }) {
  const [problem, setProblem] = useState('')
  const [lesson, setLesson] = useState('')
  const [customer, setCustomer] = useState('Customer A')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const canSubmit = problem.trim().length > 0 && lesson.trim().length > 0 && !busy

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await api.recordOutcome({
        customer: customer.trim() || 'Customer',
        email: 'support@thridhalabs.example',
        lesson: `${problem.trim()} Resolution that worked: ${lesson.trim()}`,
        scenario: problem.trim().slice(0, 120),
      })
      setSaved(result.retained)
      setProblem('')
      setLesson('')
      await onRecorded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Log a case outcome</h2>
      <p className="panel-note">
        Support-side capture. What the customer hit, and what actually resolved it. This
        becomes organizational memory for every future similar case.
      </p>
      <form className="logger" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="log-customer">Customer</label>
          <input
            id="log-customer"
            type="text"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="log-problem">Problem</label>
          <textarea
            id="log-problem"
            rows={2}
            value={problem}
            placeholder="We need to export 50,000 customer records."
            onChange={(e) => setProblem(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="log-lesson">What resolved it</label>
          <textarea
            id="log-lesson"
            rows={3}
            value={lesson}
            placeholder="The standard CSV export timed out. A background batched export with a secure download link worked."
            onChange={(e) => setLesson(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
          {busy ? 'Retaining...' : 'Retain as organizational memory'}
        </button>
        {error && <ErrorState message={error} />}
        {saved && (
          <p className="inline-notice inline-notice-success" role="status">
            Retained. It is now organizational memory &mdash; ask a similar question from the
            customer view to see it used.
          </p>
        )}
      </form>
    </section>
  )
}
