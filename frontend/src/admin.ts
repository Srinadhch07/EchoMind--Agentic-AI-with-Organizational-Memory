/**
 * Admin session state for the control plane.
 *
 * What is and is not stored
 * -------------------------
 * The backend signs an HS256 session token and returns it in an HTTP-only
 * cookie. JavaScript cannot read that cookie, which is the point: an XSS
 * payload cannot exfiltrate the session, and there is no `admin_token` in
 * localStorage or sessionStorage anywhere in this app.
 *
 * This module therefore stores NO credential. It keeps one boolean —
 * "the server told me this browser has a valid session" — so the UI can avoid a
 * login flash on re-render, and it always re-validates against
 * `GET /api/admin/auth/me` before letting anyone into the dashboard.
 *
 * Hiding a route in the client is presentation only. The real boundary is
 * `get_current_admin` in the backend, which rejects unauthenticated API calls
 * with 401 regardless of anything the browser believes.
 */

import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'

/** In-memory only. Deliberately not persisted to any storage. */
let cachedSession: { username: string } | null = null
let inFlight: Promise<{ username: string } | null> | null = null

export function cachedAdmin(): { username: string } | null {
  return cachedSession
}

export function clearCachedSession(): void {
  cachedSession = null
  inFlight = null
}

/**
 * Ask the backend whether this browser currently holds a valid admin session.
 * Always hits the network: a cached "yes" is never treated as proof.
 */
export async function verifySession(): Promise<{ username: string } | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const identity = await api.admin.me()
      cachedSession = { username: identity.username }
      return cachedSession
    } catch (err) {
      // A 401 or 503 means there is no usable session. Anything else (a network
      // failure, a 502) is deliberately NOT treated as "signed out", so a brief
      // outage cannot silently bounce a real admin to the login screen.
      if (err instanceof ApiError && (err.status === 401 || err.status === 503)) {
        cachedSession = null
        return null
      }
      throw err
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export async function signIn(username: string, password: string): Promise<{ username: string }> {
  const result = await api.admin.login(username, password)
  cachedSession = { username: result.username }
  return cachedSession
}

export async function signOut(): Promise<void> {
  try {
    await api.admin.logout()
  } finally {
    clearCachedSession()
  }
}

export type SessionState = 'checking' | 'authenticated' | 'anonymous' | 'error'

export interface AdminSession {
  state: SessionState
  username: string | null
  error: string | null
  retry: () => void
}

interface SessionResult {
  /** The attempt this result belongs to. A newer attempt means "still asking". */
  attempt: number
  state: SessionState
  username: string | null
  error: string | null
}

/**
 * Gate for the organization dashboard.
 *
 * Resolution order:
 *   1. Ask the backend. This is the only thing that grants access.
 *   2. 401/503 -> 'anonymous', and the caller redirects to /admin/login.
 *   3. Any other failure -> 'error', so a transient outage is reported as an
 *      outage rather than being mislabelled as a credentials problem.
 *
 * `enabled` should be false on public pages, so a visitor to the marketing site
 * never triggers an admin session check. The visible state is derived rather
 * than assigned: a fresh attempt is 'checking' because its result does not exist
 * yet, which keeps every state write inside an async continuation instead of in
 * the middle of an effect.
 */
export function useAdminSession(enabled = true): AdminSession {
  const [result, setResult] = useState<SessionResult | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const ask = async () => {
      try {
        const session = await verifySession()
        if (!active) return
        setResult({
          attempt,
          state: session ? 'authenticated' : 'anonymous',
          username: session?.username ?? null,
          error: null,
        })
      } catch (err) {
        if (!active) return
        setResult({
          attempt,
          state: 'error',
          username: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    void ask()
    return () => {
      active = false
    }
  }, [enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (!enabled) return { state: 'anonymous', username: null, error: null, retry }

  const current = result && result.attempt === attempt ? result : null
  return {
    state: current ? current.state : 'checking',
    username: current ? current.username : null,
    error: current ? current.error : null,
    retry,
  }
}
