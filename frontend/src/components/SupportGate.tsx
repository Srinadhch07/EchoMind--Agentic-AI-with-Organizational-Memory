import { useState, type FormEvent } from 'react'
import { COMPANY, DEMO_TOPICS } from '../brand'
import { isValidEmail, saveIdentity, type SupportIdentity } from '../session'

interface Props {
  onStart: (identity: SupportIdentity) => void
}

export default function SupportGate({ onStart }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)

  const nameError = name.trim() ? '' : 'Please tell us your name.'
  const emailError = isValidEmail(email) ? '' : 'Please enter a valid email address.'
  const valid = !nameError && !emailError

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    const identity = { name: name.trim(), email: email.trim() }
    saveIdentity(identity)
    onStart(identity)
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="agent-avatar agent-avatar-lg" aria-hidden="true">
            EM
          </span>
          <div>
            <p className="gate-company">{COMPANY.name} customer support</p>
            <h1 className="gate-title">How can we help?</h1>
            <p className="gate-subtitle">Talk to {COMPANY.supportAgent}, our AI support agent.</p>
          </div>
        </div>

        <form className="gate-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="gate-name">Name</label>
            <input
              id="gate-name"
              type="text"
              autoComplete="name"
              value={name}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && nameError && <p className="field-error">{nameError}</p>}
          </div>

          <div className="field">
            <label htmlFor="gate-email">Email</label>
            <input
              id="gate-email"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && emailError && <p className="field-error">{emailError}</p>}
            <p className="field-hint">
              Used to keep this support session traceable. No account or password needed.
            </p>
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Start Support
          </button>
        </form>

        <div className="gate-scope">
          <p className="gate-scope-title">Common questions</p>
          <ul>
            {DEMO_TOPICS.slice(0, 4).map((topic) => (
              <li key={topic.id}>
                <strong>{topic.product}</strong>
                <span>{topic.blurb}</span>
              </li>
            ))}
          </ul>
          <p className="gate-scope-note">
            These products and examples are illustrative for this support experience. They are
            not the current {COMPANY.name} catalogue.
          </p>
        </div>
      </div>
    </div>
  )
}
