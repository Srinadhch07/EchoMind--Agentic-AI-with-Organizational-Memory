interface Props {
  customer: string
  message: string
  busy: boolean
  onCustomerChange: (v: string) => void
  onMessageChange: (v: string) => void
  onAsk: () => void
}

const FIRST_CASE = 'We need to export 50,000 customer records.'
const SIMILAR_CASE = 'We need to export 50,000 records.'

export default function InteractionCard({
  customer,
  message,
  busy,
  onCustomerChange,
  onMessageChange,
  onAsk,
}: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Current Customer Interaction</h2>
      </div>
      <div className="card-body">
        <div className="field">
          <label htmlFor="customer">Customer</label>
          <input
            id="customer"
            type="text"
            value={customer}
            onChange={(e) => onCustomerChange(e.target.value)}
            placeholder="Customer A"
          />
        </div>

        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            rows={3}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="We need to export 50,000 customer records."
          />
        </div>

        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={onAsk}
            disabled={busy || message.trim() === ''}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Thinking with memory…
              </>
            ) : (
              'Ask EchoMind'
            )}
          </button>
        </div>

        <div className="divider" />
        <div className="hint">
          Demo: try the first case, record its outcome, then send the similar case
          to see memory recalled.
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onMessageChange(FIRST_CASE)}
            disabled={busy}
          >
            Use first case
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onMessageChange(SIMILAR_CASE)}
            disabled={busy}
          >
            Use similar future case
          </button>
        </div>
      </div>
    </section>
  )
}
