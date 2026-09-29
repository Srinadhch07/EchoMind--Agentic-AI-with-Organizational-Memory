import type { ReactNode } from 'react'

/** Shared loading / empty / error presentation so every panel behaves the same. */

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children && <p className="state-text">{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Something went wrong</p>
      <p className="state-text">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function InlineNotice({ tone, children }: { tone: 'info' | 'success'; children: ReactNode }) {
  return (
    <p className={`inline-notice inline-notice-${tone}`} role="status">
      {children}
    </p>
  )
}

export function DemoTag({ children = 'Simulated' }: { children?: ReactNode }) {
  return <span className="demo-tag">{children}</span>
}
