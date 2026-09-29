import type { AgentResponse } from '../types'

interface Props {
  result: AgentResponse | null
  busy: boolean
}

export default function ResponseCard({ result, busy }: Props) {
  return (
    <section className="card zone-brand">
      <div className="card-head">
        <h2>EchoMind Response</h2>
        {result && (
          <span className="chip chip-neutral">
            {result.memories_used.length} memor
            {result.memories_used.length === 1 ? 'y' : 'ies'} used
          </span>
        )}
      </div>
      <div className="card-body">
        {busy && !result && (
          <div className="loading-line">
            <span className="spinner spinner-dark" aria-hidden="true" />
            Recalling organizational memory and generating a response…
          </div>
        )}

        {!busy && !result && (
          <p className="empty">
            EchoMind&apos;s answer to the current interaction will appear here.
          </p>
        )}

        {result && (
          <>
            <div className="response-text">{result.response}</div>
            {result.reasoning && (
              <div className="reasoning">
                <span className="reasoning-label">Why EchoMind answered that</span>
                {result.reasoning}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
