import type { TimelineEntry } from '../types'

interface Props {
  entries: TimelineEntry[]
}

function formatTime(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TimelineCard({ entries }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Learning Timeline</h2>
        <span className="chip chip-neutral">{entries.length} stored</span>
      </div>
      <div className="card-body">
        {entries.length === 0 ? (
          <p className="empty">
            No experiences stored yet. Ask EchoMind something and record an outcome
            to start the organizational memory.
          </p>
        ) : (
          <div className="timeline">
            {entries.map((entry, i) => (
              <div className="tl-item" key={entry.id}>
                <div className="tl-rail">
                  <span className="tl-dot" aria-hidden="true" />
                  {i < entries.length - 1 && <span className="tl-line" />}
                </div>
                <div className="tl-body">
                  <div className="tl-title">
                    {entry.customer}
                    <span
                      className={`tag ${
                        entry.source === 'echomind-outcome'
                          ? 'tag-outcome'
                          : 'tag-interaction'
                      }`}
                    >
                      {entry.source === 'echomind-outcome'
                        ? 'outcome recorded'
                        : 'interaction'}
                    </span>
                    <span className="tl-time">{formatTime(entry.occurred_at)}</span>
                  </div>
                  {entry.lessons.map((lesson) => (
                    <div className="tl-lesson" key={lesson}>
                      {lesson}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
