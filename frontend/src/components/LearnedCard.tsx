import type { LearnedResponse } from '../types'

interface Props {
  result: LearnedResponse | null
  busy: boolean
  onAsk: () => void
}

export default function LearnedCard({ result, busy, onAsk }: Props) {
  return (
    <section className="card zone-memory">
      <div className="card-head">
        <h2>What has EchoMind learned?</h2>
        {result && result.memory_count > 0 && (
          <span className="chip chip-memory">
            synthesized from {result.memory_count} memories
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="actions" style={{ marginBottom: result ? 14 : 0 }}>
          <button className="btn btn-memory" onClick={onAsk} disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Synthesizing organizational knowledge…
              </>
            ) : (
              'What has EchoMind learned?'
            )}
          </button>
        </div>

        {result && result.summary && (
          <div className="summary-text">{result.summary}</div>
        )}

        {result && result.memory_count === 0 && (
          <p className="empty" style={{ marginTop: 10 }}>
            There is not enough stored experience yet to draw an organizational
            conclusion. Record an outcome first.
          </p>
        )}
      </div>
    </section>
  )
}
