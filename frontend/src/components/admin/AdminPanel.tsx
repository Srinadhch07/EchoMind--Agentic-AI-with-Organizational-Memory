import type { ReactNode } from 'react'
import { EmptyState, ErrorState, Loading } from '../States'

/** Shared building blocks for the admin panels, so every section reads the same. */

export function AdminHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string
  title: string
  lede?: string
  actions?: ReactNode
}) {
  return (
    <header className="admin-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="admin-title">{title}</h1>
        {lede && <p className="admin-lede">{lede}</p>}
      </div>
      {actions && <div className="admin-head-actions">{actions}</div>}
    </header>
  )
}

export function AdminPanel({
  title,
  note,
  actions,
  children,
  flush = false,
}: {
  title?: string
  note?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
}) {
  return (
    <section className={`admin-panel${flush ? ' admin-panel-flush' : ''}`}>
      {(title || actions) && (
        <div className="admin-panel-head">
          {title && <h2 className="admin-panel-title">{title}</h2>}
          {actions && <div className="admin-panel-actions">{actions}</div>}
        </div>
      )}
      {note && <div className="admin-panel-note">{note}</div>}
      {children}
    </section>
  )
}

/**
 * A metric tile.
 *
 * `value` is null when the backend could not measure it, and null renders as an
 * explicit "not available" rather than a zero. A zero would be a claim; the
 * dashboard does not make claims it cannot back up.
 */
export function AdminStat({
  label,
  value,
  hint,
  pending = false,
}: {
  label: string
  value: number | null | undefined
  hint?: string
  pending?: boolean
}) {
  const unavailable = !pending && (value === null || value === undefined)
  return (
    <div className="admin-stat">
      <p className="admin-stat-label">{label}</p>
      {pending ? (
        <p className="admin-stat-value admin-stat-pending">--</p>
      ) : unavailable ? (
        <p className="admin-stat-value admin-stat-na">Not available</p>
      ) : (
        <p className="admin-stat-value">{value}</p>
      )}
      {hint && <p className="admin-stat-hint">{hint}</p>}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'live' | 'pending' | 'approved' | 'rejected' | 'retired'

export function AdminBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>
}

/** Renders the right thing for each of the admin panel's four async states. */
export function AdminAsync({
  loading,
  error,
  empty,
  isEmpty,
  onRetry,
  children,
}: {
  loading: boolean
  error: string | null
  empty?: string
  isEmpty?: boolean
  onRetry?: () => void
  children: ReactNode
}) {
  if (loading) return <Loading label="Loading..." />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (isEmpty && empty) return <EmptyState title={empty} />
  return <>{children}</>
}

/** A labelled key/value row, used throughout memory inspection. */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-meta-row">
      <dt className="admin-meta-label">{label}</dt>
      <dd className="admin-meta-value">{children}</dd>
    </div>
  )
}
