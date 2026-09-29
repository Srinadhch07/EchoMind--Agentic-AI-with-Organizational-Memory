import type { OutcomeResponse } from '../types'

interface Props {
  lesson: string
  busy: boolean
  recorded: OutcomeResponse | null
  onLessonChange: (v: string) => void
  onRecord: () => void
}

const SUGGESTED =
  'The standard CSV export timed out twice. A background batched export that emails a secure download link worked.'

export default function OutcomeCard({
  lesson,
  busy,
  recorded,
  onLessonChange,
  onRecord,
}: Props) {
  return (
    <section className="card zone-learn">
      <div className="card-head">
        <h2>Newly Learned Experience</h2>
        {recorded?.retained && <span className="chip chip-neutral">Retained</span>}
      </div>
      <div className="card-body">
        {recorded?.retained ? (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              EchoMind has stored this outcome. It will be recalled the next time a
              similar request comes in.
            </p>
            <div className="memory" style={{ marginTop: 8 }}>
              <div className="memory-fact">&ldquo;{recorded.lesson}&rdquo;</div>
              <div className="memory-meta">
                <span className="meta-pill">organizational lesson</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="lesson">
                What happened, and what should the organization remember?
              </label>
              <textarea
                id="lesson"
                rows={3}
                value={lesson}
                onChange={(e) => onLessonChange(e.target.value)}
                placeholder={SUGGESTED}
              />
            </div>
            <div className="actions">
              <button
                className="btn btn-memory"
                onClick={onRecord}
                disabled={busy || lesson.trim() === ''}
              >
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Retaining…
                  </>
                ) : (
                  'Record Outcome'
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onLessonChange(SUGGESTED)}
                disabled={busy}
              >
                Use example outcome
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
