import { useState, type FormEvent } from 'react'
import { ApiError } from '../api'
import { signIn } from '../admin'
import { COMPANY } from '../brand'
import Link from '../components/Link'
import { navigate } from '../router'

/**
 * /admin/login
 *
 * The Organization dashboard is not public. This page is the only way in, and it
 * is deliberately plain: a real credential exchange, with the errors a real one
 * can produce (bad credentials, admin not configured, backend unreachable,
 * request in flight).
 *
 * The failure message never distinguishes "no such user" from "wrong password".
 * The backend returns one message for both, and this page does not add a second
 * signal such as field-level highlighting that could leak it.
 */
export default function AdminLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True when the backend answered "not configured" rather than "bad password". */
  const [notConfigured, setNotConfigured] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotConfigured(false)

    try {
      await signIn(username.trim(), password)
      navigate('/organization')
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotConfigured(true)
        setError(err.message)
      } else if (err instanceof ApiError && err.status === 0) {
        setError(
          'Could not reach the EchoMind backend. The login request never left the browser — check that the API server is running.',
        )
      } else if (err instanceof ApiError && err.status === 401) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <span className="wordmark-mark" aria-hidden="true">
            {COMPANY.mark}
          </span>
          <div>
            <p className="admin-login-product">{COMPANY.name}</p>
            <p className="admin-login-role">Organization Admin</p>
          </div>
        </div>

        <h1 className="admin-login-title">Sign in to the control plane</h1>
        <p className="admin-login-lede">
          Manage {COMPANY.product}&rsquo;s organizational memory, review learning, and moderate
          public testimonials.
        </p>

        {error && (
          <div
            className={`admin-login-alert${notConfigured ? ' admin-login-alert-config' : ''}`}
            role="alert"
          >
            <p className="admin-login-alert-title">
              {notConfigured ? 'Admin access is not configured' : 'Sign-in failed'}
            </p>
            <p className="admin-login-alert-body">{error}</p>
            {notConfigured && (
              <p className="admin-login-alert-body">
                Set <code>ADMIN_USERNAME</code>, <code>ADMIN_SECRET_KEY</code> and either{' '}
                <code>ADMIN_PASSWORD_HASH</code> or <code>ADMIN_PASSWORD</code> in the backend
                environment, then restart it.
              </p>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              disabled={busy}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !username.trim() || !password}
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="admin-login-foot">
          <Link to="/">Back to {COMPANY.product}</Link>
        </p>
      </div>
    </div>
  )
}
