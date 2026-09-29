import type { RecalledMemory } from '../types'

interface Props {
  memories: RecalledMemory[]
  totalRecalled: number
  recalledNow: boolean
}

function MemoryFact({ memory }: { memory: RecalledMemory }) {
  const source = memory.metadata?.source
  const scenario = memory.metadata?.scenario

  return (
    <article className="memory">
      <div className="memory-fact">&ldquo;{memory.text}&rdquo;</div>
      <div className="memory-meta">
        {memory.type && <span className="meta-pill">{memory.type}</span>}
        {scenario && <span className="meta-pill">{scenario}</span>}
        {source && <span className="meta-pill">{source}</span>}
        {memory.context && <span className="meta-pill">{memory.context}</span>}
        {memory.score != null && (
          <span className="meta-pill score" title="relevance score">
            relevance {memory.score.toFixed(2)}
          </span>
        )}
      </div>
    </article>
  )
}

export default function MemoryCard({ memories, totalRecalled, recalledNow }: Props) {
  return (
    <section className="card zone-memory">
      <div className="card-head">
        <h2>🧠 Recalled Organizational Memory</h2>
        {recalledNow && memories.length > 0 && (
          <span className="chip chip-memory">Memory recalled</span>
        )}
      </div>
      <div className="card-body">
        {memories.length === 0 ? (
          <p className="empty">
            No prior experience was relevant to this interaction, so EchoMind
            answered from first principles. Record an outcome below — the next
            similar request will recall it.
          </p>
        ) : (
          <>
            {recalledNow && (
              <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
                EchoMind recalled {totalRecalled} past experience
                {totalRecalled === 1 ? '' : 's'} from this organization and used{' '}
                {memories.length} of {totalRecalled} to answer.
              </p>
            )}
            {memories.map((m) => (
              <MemoryFact key={m.id} memory={m} />
            ))}
          </>
        )}
      </div>
    </section>
  )
}
