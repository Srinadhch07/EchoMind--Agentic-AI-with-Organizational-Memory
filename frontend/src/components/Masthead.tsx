interface Props {
  experienceCount: number
  connected: boolean
}

export default function Masthead({ experienceCount, connected }: Props) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            EM
          </div>
          <div>
            <div className="brand-name">EchoMind</div>
            <div className="brand-tag">Organizational Memory for AI Agents</div>
          </div>
        </div>

        <div className="masthead-meta">
          <span className="chip chip-neutral">Customer Support</span>
          <span className="chip chip-memory">
            🧠 Memory: {experienceCount} experience{experienceCount === 1 ? '' : 's'}
          </span>
          <span className="chip chip-neutral chip-strong">
            {connected ? 'Backend connected' : 'Backend offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
