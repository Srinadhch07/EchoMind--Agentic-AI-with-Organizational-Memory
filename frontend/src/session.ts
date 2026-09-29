/**
 * Support-session identity.
 *
 * The customer enters a name and an email address to open a support session. This
 * is deliberately NOT authentication: there are no passwords and nothing here
 * grants access to anything. It is the minimum identity a real support tool needs
 * to address someone correctly and to keep a per-session history.
 *
 * The email address is sent to the backend for support traceability only. It is
 * never written to organizational memory and never sent to the language model, so
 * it cannot leak into a later customer's answer.
 */

export interface SupportIdentity {
  name: string
  email: string
}

const STORAGE_KEY = 'echomind.support.identity.v1'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

export function loadIdentity(): SupportIdentity | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupportIdentity>
    if (typeof parsed?.name !== 'string' || typeof parsed?.email !== 'string') return null
    if (!parsed.name.trim() || !isValidEmail(parsed.email)) return null
    return { name: parsed.name.trim(), email: parsed.email.trim() }
  } catch {
    return null
  }
}

export function saveIdentity(identity: SupportIdentity): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: identity.name.trim(), email: identity.email.trim() }),
    )
  } catch {
    /* private browsing or storage disabled: the session still works in memory */
  }
}

export function clearIdentity(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clean up */
  }
}

/** "Srinadh" -> "Hi Srinadh". Keeps the greeting natural for any name. */
export function greetingFor(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first ? `Hi ${first}` : 'Hi'
}
