import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { TimelineEntry } from '../../types'
import { deriveSignals, formatWhen, isOutcomeEntry, parseExperience } from '../../lib/experiences'
import { AdminAsync, AdminBadge, AdminHeader, AdminPanel } from './AdminPanel'

/**
 * Customer experiences.
 *
 * An experience is a retained support DOCUMENT, not a Hindsight memory. Hindsight
 * decomposes each retained document into several atomic memory units, so one
 * experience here can own many memories in the Memories panel. They are shown as
 * separate concepts on purpose: conflating them would misrepresent what Hindsight
 * stores and would suggest an experience can be edited like a memory.
 *
 * What is supported here is what Hindsight supports: inspect, and record a new
 * outcome. Editing an experience's text is a memory-level curate, done from the
 * Memories panel.
 */
export default function ExperiencesPanel({ onChanged }: { onChanged?: () => void }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outcomeRecorded, setOutcomeRecorded] = useState(false)

  const read = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.experiences()
      setEntries(result.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = { cancelled: false }
    const start = async () => {
      try {
        const result = await api.admin.experiences()
        if (token.cancelled) return
        setEntries(result.entries)
        setError(null)
      } catch (err) {
        if (token.cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!token.cancelled) setLoading(false)
      }
    }
    void start()
    return () => {
      token.cancelled = true
    }
  }, [])

  const signals = deriveSignals(entries)
  const outcomes = entries.filter(isOutcomeEntry).length

  return (
    <>
      <AdminHeader
        eyebrow="Memory"
        title="Experiences"
        lede="Support cases EchoMind has processed, and what actually happened in each one."
        actions={
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void read()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <AdminPanel
        note={
          <>
            An experience is the record of one support case. It is retained in Hindsight as a
            document and decomposed into individual memory units &mdash; those are what the
            Memories panel lists and curates. Correcting what EchoMind learned is done at the
            memory level, not here.
          </>
        }
      >
        <AdminAsync
          loading={loading}
          error={error}
          isEmpty={!loading && entries.length === 0}
          empty="No experiences recorded yet. Ask EchoMind a question from the customer support view, then record the outcome."
          onRetry={() => void read()}
        >
          <>
            <p className="admin-count">
              {entries.length} {entries.length === 1 ? 'experience' : 'experiences'} &middot;{' '}
              {outcomes} with a recorded outcome
            </p>

            {signals.length > 0 && (
              <div className="admin-signals">
                <p className="admin-subhead">Recurring themes</p>
                <ul className="signal-grid">
                  {signals.slice(0, 6).map((signal) => (
                    <li className="signal" key={signal.label}>
                      <div className="signal-head">
                        <span className="signal-label">{signal.label}</span>
                        <span className="signal-count">
                          {signal.count} {signal.count === 1 ? 'experience' : 'experiences'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="admin-experience-list">
              {entries.map((entry) => {
                const outcome = isOutcomeEntry(entry)
                const { problem, action } = parseExperience(entry.lessons)
                return (
                  <li className="admin-experience" key={entry.id}>
                    <div className="admin-experience-head">
                      <AdminBadge tone={outcome ? 'approved' : 'live'}>
                        {outcome ? 'Outcome' : 'Interaction'}
                      </AdminBadge>
                      <span className="admin-experience-when">{formatWhen(entry.occurred_at)}</span>
                      <span className="admin-experience-customer">{entry.customer}</span>
                    </div>
                    <ol className="admin-experience-steps">
                      <li>
                        <span className="admin-step-label">Problem</span>
                        <span className="admin-step-text">{problem || 'Not recorded'}</span>
                      </li>
                      <li>
                        <span className="admin-step-label">Action taken</span>
                        <span className="admin-step-text">{action || 'Not recorded'}</span>
                      </li>
                      <li>
                        <span className="admin-step-label">
                          {outcome ? 'Lesson learned' : 'Outcome'}
                        </span>
                        <span className="admin-step-text">
                          {outcome
                            ? action || 'Not recorded'
                            : 'Awaiting a recorded outcome for this case.'}
                        </span>
                      </li>
                    </ol>
                    <p className="admin-experience-source">
                      Source document <code>{entry.id}</code>
                    </p>
                  </li>
                )
              })}
            </ol>
          </>
        </AdminAsync>
      </AdminPanel>

      <OutcomeRecorder
        onRecorded={async () => {
          setOutcomeRecorded(true)
          await read()
          onChanged?.()
        }}
      />

      {outcomeRecorded && (
        <p className="inline-notice inline-notice-success" role="status">
          Outcome retained. It is now organizational memory and will be recalled for similar
          future cases.
        </p>
      )}
    </>
  )
}

function OutcomeRecorder({ onRecorded }: { onRecorded: () => Promise<void> }) {
  const [customer, setCustomer] = useState('')
  const [problem, setProblem] = useState('')
  const [lesson, setLesson] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = problem.trim().length > 0 && lesson.trim().length > 0 && !busy

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await api.admin.recordOutcome({
        customer: customer.trim() || 'Customer',
        lesson: `${problem.trim()} Resolution that worked: ${lesson.trim()}`,
        scenario: problem.trim().slice(0, 200),
      })
      setCustomer('')
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
    <AdminPanel
      title="Record a case outcome"
      note="What the customer hit, and what actually resolved it. This becomes organizational memory for every future similar case."
    >
      <form onSubmit={onSubmit} className="admin-form">
        <div className="field">
          <label htmlFor="admin-log-customer">Customer</label>
          <input
            id="admin-log-customer"
            type="text"
            value={customer}
            placeholder="Customer A"
            onChange={(e) => setCustomer(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-log-problem">Problem</label>
          <textarea
            id="admin-log-problem"
            rows={2}
            value={problem}
            placeholder="We need to export 50,000 customer records."
            onChange={(e) => setProblem(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-log-lesson">What resolved it</label>
          <textarea
            id="admin-log-lesson"
            rows={3}
            value={lesson}
            placeholder="The standard CSV export timed out. A background batched export with a secure download link worked."
            onChange={(e) => setLesson(e.target.value)}
          />
        </div>
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? 'Retaining...' : 'Retain as organizational memory'}
        </button>
      </form>
    </AdminPanel>
  )
}
