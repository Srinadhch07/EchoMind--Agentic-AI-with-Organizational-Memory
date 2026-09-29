import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { signOut } from '../admin'
import { COMPANY, DEMO_DISCLAIMER } from '../brand'
import { AdminShell, type AdminView } from '../components/admin/AdminShell'
import OverviewPanel from '../components/admin/OverviewPanel'
import MemoriesPanel from '../components/admin/MemoriesPanel'
import ExperiencesPanel from '../components/admin/ExperiencesPanel'
import LearningPanel from '../components/admin/LearningPanel'
import TestimonialsPanel from '../components/admin/TestimonialsPanel'
import SettingsPanel from '../components/admin/SettingsPanel'
import { AdminPanel } from '../components/admin/AdminPanel'

/**
 * The Organization control plane.
 *
 * Reached only after `useAdminSession` has confirmed a valid server session.
 * That confirmation is a convenience; the actual boundary is `get_current_admin`
 * in the backend, so every panel below would receive 401 without a session no
 * matter how this page was rendered.
 *
 * Section state lives in the URL fragment rather than in component state, so a
 * refresh or a shared link lands on the same section, and the browser's back
 * button works.
 */
export default function OrganizationPage({ username }: { username: string | null }) {
  const [view, setView] = useState<AdminView>(readViewFromHash())
  const [bankId, setBankId] = useState<string | undefined>(undefined)
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    const onHashChange = () => setView(readViewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = useCallback((next: AdminView) => {
    window.history.replaceState(null, '', `#${next}`)
    setView(next)
  }, [])

  const handleSignOut = useCallback(() => {
    void signOut().finally(() => {
      window.history.pushState({}, '', '/admin/login')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  }, [])

  /**
   * Keeps the sidebar's bank name and pending-testimonial badge current. It reads
   * the same endpoints the panels read, so a change made in one section shows up
   * in the chrome after a write elsewhere.
   */
  useEffect(() => {
    const token = { cancelled: false }
    const start = async () => {
      try {
        const [overview, queue] = await Promise.all([
          api.admin.overview(),
          api.admin.testimonials(),
        ])
        if (token.cancelled) return
        setBankId(overview.bank_id)
        setPendingCount(queue.counts.pending ?? queue.pending.length)
      } catch {
        // The sidebar chrome is decoration. A failure here must not take down
        // the panel the administrator actually asked for, and every panel
        // surfaces its own errors, so this is deliberately silent.
      }
    }
    void start()
    return () => {
      token.cancelled = true
    }
  }, [bump])

  const refreshChrome = useCallback(() => setBump((n) => n + 1), [])

  return (
    <AdminShell
      view={view}
      onView={go}
      username={username}
      bankId={bankId}
      pendingCount={pendingCount}
    >
      {view === 'overview' && <OverviewPanel onNavigate={go} />}
      {view === 'memories' && <MemoriesPanel />}
      {view === 'experiences' && <ExperiencesPanel onChanged={refreshChrome} />}
      {view === 'learning' && <LearningPanel />}
      {view === 'testimonials' && <TestimonialsPanel onChanged={refreshChrome} />}
      {view === 'settings' && <SettingsPanel onSignOut={handleSignOut} />}

      <AdminPanel note={DEMO_DISCLAIMER} flush>
        <p className="admin-colophon">
          {COMPANY.name} organization console &middot; administrative access is recorded in the
          server log.
        </p>
      </AdminPanel>
    </AdminShell>
  )
}

/** Maps `#memories` to a known section, defaulting to the overview. */
function readViewFromHash(): AdminView {
  const known: AdminView[] = [
    'overview',
    'memories',
    'experiences',
    'learning',
    'testimonials',
    'settings',
  ]
  const raw = window.location.hash.replace('#', '').trim().toLowerCase()
  return known.includes(raw as AdminView) ? (raw as AdminView) : 'overview'
}
