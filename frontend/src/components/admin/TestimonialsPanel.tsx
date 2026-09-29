import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../../api'
import type { AdminTestimonial, TestimonialStatus } from '../../types'
import { AdminBadge, AdminHeader, AdminPanel } from './AdminPanel'
import { formatWhen } from '../../lib/experiences'
import { EmptyState, ErrorState, Loading } from '../States'

/**
 * Testimonial moderation.
 *
 * Three queues: pending (awaiting a decision), approved (live on the public
 * Why EchoMind page) and rejected.
 *
 * The submitter's email address is shown here and only here, because a moderator
 * needs it to follow up. The public endpoint returns TestimonialPublic, a
 * separate shape with no email field, so this data cannot reach the public page.
 * Approving an entry never publishes its email.
 */

type Action = 'approve' | 'reject' | 'unpublish' | 'delete'

export default function TestimonialsPanel({ onChanged }: { onChanged?: () => void }) {
  const [pending, setPending] = useState<AdminTestimonial[]>([])
  const [approved, setApproved] = useState<AdminTestimonial[]>([])
  const [rejected, setRejected] = useState<AdminTestimonial[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ item: AdminTestimonial; action: Action } | null>(null)

  const read = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.testimonials()
      setPending(result.pending)
      setApproved(result.approved)
      setRejected(result.rejected)
      setCounts(result.counts)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = { cancelled: false }
    const start = async () => {
      try {
        const result = await api.admin.testimonials()
        if (token.cancelled) return
        setPending(result.pending)
        setApproved(result.approved)
        setRejected(result.rejected)
        setCounts(result.counts)
        setError(null)
      } catch (err) {
        if (token.cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!token.cancelled) setLoading(false)
      }
    }
    void start()
    return () => {
      token.cancelled = true
    }
  }, [])

  const run = async (item: AdminTestimonial, action: Action) => {
    setBusyId(item.id)
    setError(null)
    setNotice(null)
    try {
      const result = await api.admin.moderateTestimonial(item.id, action)
      setNotice(result.message)
      setConfirming(null)
      await read()
      onChanged?.()
    } catch (err) {
      setError(describeModerationError(err))
      setConfirming(null)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <Loading label="Loading moderation queue..." />
  if (error && pending.length === 0 && approved.length === 0 && rejected.length === 0) {
    return <ErrorState message={error} onRetry={() => void read()} />
  }

  return (
    <>
      <AdminHeader
        eyebrow="Content"
        title="Testimonials"
        lede="Review voluntary submissions from the public Why EchoMind page. Nothing is published without approval."
        actions={
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void read()} disabled={loading}>
            Refresh
          </button>
        }
      />

      {notice && (
        <p className="inline-notice inline-notice-success" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorState message={error} onRetry={() => void read()} />}

      <AdminPanel
        title={`Pending (${pending.length})`}
        note="Waiting for a decision. These are not visible on the public page."
      >
        {pending.length === 0 ? (
          <EmptyState title="No testimonials are waiting for review." />
        ) : (
          <ul className="admin-testimonial-list">
            {pending.map((item) => (
              <TestimonialRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                actions={[
                  { label: 'Approve', kind: 'primary', action: 'approve' },
                  { label: 'Reject', kind: 'soft', action: 'reject' },
                  { label: 'Delete', kind: 'danger-soft', action: 'delete' },
                ]}
                onAct={(action) => {
                  if (action === 'delete') setConfirming({ item, action })
                  else void run(item, action)
                }}
              />
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel
        title={`Approved (${approved.length})`}
        note="Published on the public Why EchoMind page. Only approved submissions that gave permission appear there."
      >
        {approved.length === 0 ? (
          <EmptyState title="No testimonials are published yet." />
        ) : (
          <ul className="admin-testimonial-list">
            {approved.map((item) => (
              <TestimonialRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                actions={[
                  { label: 'Unpublish', kind: 'soft', action: 'unpublish' },
                  { label: 'Delete', kind: 'danger-soft', action: 'delete' },
                ]}
                onAct={(action) => {
                  if (action === 'delete') setConfirming({ item, action })
                  else void run(item, action)
                }}
              />
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel
        title={`Rejected (${rejected.length})`}
        note="Declined submissions. These are never shown publicly and can be removed."
      >
        {rejected.length === 0 ? (
          <EmptyState title="No rejected testimonials." />
        ) : (
          <ul className="admin-testimonial-list">
            {rejected.map((item) => (
              <TestimonialRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                actions={[{ label: 'Delete', kind: 'danger-soft', action: 'delete' }]}
                onAct={(action) => {
                  if (action === 'delete') setConfirming({ item, action })
                  else void run(item, action)
                }}
              />
            ))}
          </ul>
        )}
      </AdminPanel>

      <p className="admin-footnote">
        Queue totals from the database: {counts.pending ?? 0} pending, {counts.approved ?? 0}{' '}
        approved, {counts.rejected ?? 0} rejected.
      </p>

      {confirming && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm delete testimonial">
          <div className="admin-modal">
            <h2 className="admin-modal-title">Delete this testimonial permanently?</h2>
            <p className="admin-modal-warning">
              This removes the submission and its contact address from the database. It cannot
              be undone.
            </p>
            <blockquote className="admin-modal-quote">{confirming.item.testimonial}</blockquote>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busyId === confirming.item.id}
                onClick={() => void run(confirming.item, confirming.action)}
              >
                {busyId === confirming.item.id ? 'Deleting...' : 'Delete Testimonial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TestimonialRow({
  item,
  actions,
  busy,
  onAct,
}: {
  item: AdminTestimonial
  actions: { label: string; kind: string; action: Action }[]
  busy: boolean
  onAct: (action: Action) => void
}) {
  const status: TestimonialStatus = item.status as TestimonialStatus
  const tone =
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'

  return (
    <li className="admin-testimonial">
      <div className="admin-testimonial-head">
        <span className="admin-testimonial-name">{item.name}</span>
        <AdminBadge tone={tone}>{status}</AdminBadge>
        {item.is_sample && <AdminBadge tone="neutral">sample</AdminBadge>}
        {!item.permission && <AdminBadge tone="neutral">no public permission</AdminBadge>}
        <span className="admin-testimonial-when">{formatWhen(item.created_at)}</span>
      </div>

      {(item.role || item.organization) && (
        <p className="admin-testimonial-byline">
          {[item.role, item.organization].filter(Boolean).join(' · ')}
        </p>
      )}

      <p className="admin-testimonial-text">{item.testimonial}</p>

      <p className="admin-testimonial-contact">
        {/* Admin-only. Never returned by the public endpoint. */}
        Contact: {item.email || 'No address given'}
      </p>

      <div className="admin-testimonial-actions">
        {actions.map((action) => (
          <button
            key={action.action}
            type="button"
            className={`btn btn-${action.kind} btn-sm`}
            disabled={busy}
            onClick={() => onAct(action.action)}
          >
            {busy ? '...' : action.label}
          </button>
        ))}
      </div>
    </li>
  )
}

function describeModerationError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your admin session has expired. Sign in again.'
    if (err.status === 404) return 'That testimonial no longer exists. The queue has been refreshed.'
  }
  return err instanceof Error ? err.message : String(err)
}
