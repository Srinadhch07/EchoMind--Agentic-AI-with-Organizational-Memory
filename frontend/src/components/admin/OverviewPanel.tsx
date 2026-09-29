import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { FlowDiagram } from '../Shell'
import { formatWhen } from '../../lib/experiences'
import type { AdminOverview } from '../../types'
import { AdminAsync, AdminHeader, AdminPanel, AdminStat } from './AdminPanel'

/**
 * Admin overview.
 *
 * Every figure here is measured, never invented:
 *   - memory counts come from Hindsight's /stats endpoint
 *   - experience counts come from the real retained learning timeline
 *   - testimonial counts come from a GROUP BY on the submissions table
 *
 * When a source is unavailable the tile shows "Not available" rather than a
 * zero, because a zero is a claim and this dashboard does not make claims it
 * cannot back up.
 */
export default function OverviewPanel({
  onNavigate,
}: {
  onNavigate: (view: 'memories' | 'experiences' | 'learning' | 'testimonials') => void
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setOverview(await api.admin.overview())
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
        const result = await api.admin.overview()
        if (token.cancelled) return
        setOverview(result)
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

  return (
    <>
      <AdminHeader
        eyebrow="EchoMind"
        title="Overview"
        lede="The state of EchoMind's organizational memory and public content."
        actions={
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void read()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <AdminPanel
        title="How memory is built"
        note="Kept from the original organization view, because it explains what the numbers above are counting."
      >
        <FlowDiagram variant="organization" />
      </AdminPanel>

      <AdminPanel title="Organizational memory" note="Counts read directly from the Hindsight memory bank.">
        <AdminAsync loading={loading} error={error} onRetry={() => void read()}>
          <div className="admin-stat-row">
            <AdminStat
              label="Organizational Memories"
              value={overview?.total_memories}
              pending={loading}
              hint="from Hindsight /stats"
            />
            <AdminStat
              label="Customer Experiences"
              value={overview?.experiences}
              pending={loading}
              hint="retained support documents"
            />
            <AdminStat
              label="Outcomes Recorded"
              value={overview?.outcomes}
              pending={loading}
              hint="cases with a known result"
            />
            <AdminStat
              label="Source Documents"
              value={overview?.total_documents}
              pending={loading}
              hint="documents behind the memories"
            />
          </div>
        </AdminAsync>
      </AdminPanel>

      <AdminPanel title="Testimonials" note="Submission queue from the public Why EchoMind page.">
        <div className="admin-stat-row">
          <AdminStat
            label="Pending Testimonials"
            value={overview?.pending_testimonials ?? null}
            hint="awaiting review"
          />
          <AdminStat
            label="Approved Testimonials"
            value={overview?.approved_testimonials ?? null}
            hint="visible on the public page"
          />
          <AdminStat
            label="Rejected Testimonials"
            value={overview?.rejected_testimonials ?? null}
            hint="never published"
          />
        </div>
        <div className="admin-quick-links">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('testimonials')}>
            Review submissions
          </button>
        </div>
      </AdminPanel>

      <AdminPanel title="System activity" note="Recent writes and bank health.">
        <ul className="admin-activity">
          <li>
            <span className="admin-activity-label">Memory bank</span>
            <code>{overview?.bank_id ?? '-'}</code>
          </li>
          <li>
            <span className="admin-activity-label">Bank exists</span>
            {overview?.bank_exists ? 'Yes' : 'No memories stored yet'}
          </li>
          <li>
            <span className="admin-activity-label">Last memory write</span>
            {formatWhen(overview?.last_memory_write_at)}
          </li>
          <li>
            <span className="admin-activity-label">Customers involved</span>
            {overview?.customers ?? 'Not available'}
          </li>
        </ul>
        <div className="admin-quick-links">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onNavigate('memories')}>
            Browse memories
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onNavigate('learning')}>
            View learning
          </button>
        </div>
      </AdminPanel>
    </>
  )
}
