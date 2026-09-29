import { useState, type ReactNode } from 'react'
import { signOut } from '../../admin'
import { COMPANY } from '../../brand'
import Link from '../Link'

/**
 * Admin chrome: a fixed dark-forest sidebar beside a cream workspace.
 *
 * Kept in the four-colour EchoMind palette. The sidebar is the only place the
 * product goes dark, which is what separates "admin console" from the public
 * pages without inventing a second visual language.
 */

export type AdminView =
  | 'overview'
  | 'memories'
  | 'experiences'
  | 'learning'
  | 'testimonials'
  | 'settings'

interface NavGroup {
  label: string
  items: { id: AdminView; label: string }[]
}

/** Matches the control-plane sections an administrator actually needs. */
const ADMIN_NAV: NavGroup[] = [
  { label: 'EchoMind', items: [{ id: 'overview', label: 'Overview' }] },
  {
    label: 'Memory',
    items: [
      { id: 'memories', label: 'Memories' },
      { id: 'experiences', label: 'Experiences' },
      { id: 'learning', label: 'Learning' },
    ],
  },
  { label: 'Content', items: [{ id: 'testimonials', label: 'Testimonials' }] },
  { label: 'System', items: [{ id: 'settings', label: 'Settings' }] },
]

export function AdminShell({
  view,
  onView,
  username,
  bankId,
  pendingCount,
  children,
}: {
  view: AdminView
  onView: (view: AdminView) => void
  username: string | null
  bankId?: string
  pendingCount?: number
  children: ReactNode
}) {
  /**
   * Narrow screens get a disclosure instead of the sidebar column, so the
   * console starts with the section the administrator asked for rather than a
   * tall menu they have to scroll past on every page.
   *
   * Unlike the public header this does not use `hidden`: at desktop widths the
   * panel must stay visible, and `display: contents` keeps it invisible as a box
   * in the desktop sidebar layout instead.
   */
  // Stored with the view it was opened on, so selecting a section closes the
  // panel during render rather than in a follow-up effect.
  const [nav, setNav] = useState<{ open: boolean; view: AdminView }>({ open: false, view })
  const navOpen = nav.view === view && nav.open
  const setNavOpen = (open: boolean | ((was: boolean) => boolean)) =>
    setNav((was) => ({ open: typeof open === 'function' ? open(was.open) : open, view }))

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-side-head">
          <div className="admin-side-brand">
            <span className="wordmark-mark" aria-hidden="true">
              {COMPANY.mark}
            </span>
            <div>
              <p className="admin-side-name">{COMPANY.name}</p>
              <p className="admin-side-role">Organization Admin</p>
            </div>
          </div>

          {/* Hidden above the breakpoint by CSS, so the desktop sidebar has no
              control that does nothing. */}
          <button
            type="button"
            className="admin-side-toggle"
            aria-expanded={navOpen}
            aria-controls="admin-sections"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? 'Close' : 'Sections'}
          </button>
        </div>

        <div className="admin-side-body" id="admin-sections" data-open={navOpen ? 'true' : 'false'}>
          <nav className="admin-nav" aria-label="Admin sections">
            {ADMIN_NAV.map((group) => (
              <div className="admin-nav-group" key={group.label}>
                <p className="admin-nav-label">{group.label}</p>
                <ul className="admin-nav-list">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`admin-nav-link${view === item.id ? ' admin-nav-link-active' : ''}`}
                        aria-current={view === item.id ? 'page' : undefined}
                        onClick={() => onView(item.id)}
                      >
                        <span>{item.label}</span>
                        {item.id === 'testimonials' && pendingCount ? (
                          <span className="admin-nav-badge">{pendingCount}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="admin-side-foot">
            {bankId && (
              <p className="admin-side-bank">
                Memory bank <code>{bankId}</code>
              </p>
            )}
            <p className="admin-side-user">{username ? `Signed in as ${username}` : 'Signed in'}</p>
            <div className="admin-side-actions">
              <Link to="/" className="admin-side-link">
                Public site
              </Link>
              <button
                type="button"
                className="admin-side-link admin-side-logout"
                onClick={() => {
                  // Navigate in `finally`, not `then`. `signOut` always clears the
                  // local session, so a failed logout call must not strand the
                  // admin on a dashboard the backend will now reject.
                  void signOut().finally(() => {
                    window.history.pushState({}, '', '/admin/login')
                    window.dispatchEvent(new PopStateEvent('popstate'))
                  })
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-main-inner">{children}</div>
      </div>
    </div>
  )
}
