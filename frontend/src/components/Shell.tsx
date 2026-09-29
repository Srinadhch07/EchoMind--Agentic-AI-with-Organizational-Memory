import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from './Link'
import { pathOf, type RouteId } from '../router'
import { COMPANY, NAV_LINKS } from '../brand'

interface Props {
  route: RouteId
}

/**
 * Public site header.
 *
 * Desktop shows the links inline. Below the navigation breakpoint the same links
 * move into a disclosure panel, because a horizontally scrolling link row is
 * unusable on a phone and hides links behind an edge the user has to discover.
 *
 * The panel is a plain disclosure rather than a modal: no focus trap, no
 * background scroll lock, and `hidden` removes it from the tab order entirely
 * when closed. Escape closes it and returns focus to the button that opened it,
 * and any navigation closes it, so a tap that lands on a link never leaves an
 * open panel behind.
 */
export default function Navigation({ route }: Props) {
  // The open flag is stored with the route it was opened on, so a route change
  // closes the menu during render instead of in an effect. This covers every
  // source of navigation, including the back button, with no extra pass.
  const [menu, setMenu] = useState<{ open: boolean; route: RouteId }>({
    open: false,
    route,
  })
  const menuOpen = menu.route === route && menu.open
  // Accepts an updater so the toggle handler reads as a toggle, and closes
  // immediately on navigation by passing a plain false.
  const closeMenu = useCallback(() => setMenu({ open: false, route }), [route])
  const setMenuOpen = (open: boolean | ((was: boolean) => boolean)) =>
    setMenu((was) => ({ open: typeof open === 'function' ? open(was.open) : open, route }))
  const toggleRef = useRef<HTMLButtonElement>(null)
  const currentPath = pathOf(route)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeMenu()
      // Returning focus is what makes Escape usable from the keyboard: without
      // it, focus stays on a control that is no longer rendered.
      toggleRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, closeMenu])

  // Growing past the breakpoint must not leave an invisible panel open, which
  // would swallow the first tap on a desktop link.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 721px)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu()
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [closeMenu])

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="wordmark" aria-label={`${COMPANY.name} home`}>
          <span className="wordmark-mark" aria-hidden="true">
            {COMPANY.mark}
          </span>
          <span className="wordmark-text">
            <span className="wordmark-company">{COMPANY.name}</span>
            <span className="wordmark-product">{COMPANY.product}</span>
          </span>
        </Link>

        <nav className="topnav" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="topnav-link"
              aria-current={currentPath === link.to ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-cta">
          <Link to="/support" className="btn btn-primary btn-sm">
            Get Customer Support
          </Link>
        </div>

        <button
          type="button"
          ref={toggleRef}
          className="topbar-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {/* The bars are decoration; the word beside them is the real label,
              which is why this is a labelled button and not an icon-only one. */}
          <span className="topbar-toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <div className="topbar-menu" id="primary-menu" hidden={!menuOpen}>
        <nav className="topnav-menu-list" aria-label="Primary">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="topnav-menu-link"
                  aria-current={currentPath === link.to ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          to="/support"
          className="btn btn-primary btn-block topbar-menu-cta"
          onClick={closeMenu}
        >
          Get Customer Support
        </Link>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-line">
          <strong>{COMPANY.name}</strong> · {COMPANY.tagline}
        </p>
        <p className="site-footer-line">
          <span className="powered">Powered by {COMPANY.name}</span>
          <span className="site-footer-sep" aria-hidden="true">
            ·
          </span>
          <span>
            {COMPANY.product} is an experimental customer-support intelligence system
            demonstrating persistent organizational memory for AI agents.
          </span>
        </p>
        <p className="site-footer-line site-footer-muted">
          Demo environment. Customer support conversations are illustrative and are not
          real Thridha Labs customer records.
        </p>
        <p className="site-footer-line">
          <Link to="/organization" className="footer-admin-link">
            Organization Admin
          </Link>
        </p>
      </div>
    </footer>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
}: {
  eyebrow?: string
  title: string
  lede?: string
  align?: 'left' | 'center'
}) {
  return (
    <div className={`section-heading section-heading-${align}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {lede && <p className="section-lede">{lede}</p>}
    </div>
  )
}

export function FlowDiagram({ variant }: { variant: 'home' | 'organization' }) {
  const steps =
    variant === 'home'
      ? [
          { key: 'customer', label: 'Customer', note: 'asks for help' },
          { key: 'agent', label: COMPANY.product, note: 'understands + recalls' },
          { key: 'memory', label: 'Memory', note: 'experience retained' },
          { key: 'org', label: 'Organization', note: 'learns over time' },
        ]
      : [
          { key: 'interactions', label: 'Customer interactions', note: 'real support cases' },
          { key: 'experience', label: 'Experience', note: 'what was recommended' },
          { key: 'outcome', label: 'Outcome', note: 'what actually worked' },
          { key: 'memory', label: 'Organizational memory', note: 'lesson retained' },
          { key: 'future', label: 'Future support agent', note: 'recalls the lesson' },
          { key: 'better', label: 'Better support', note: 'next customer benefits' },
        ]

  return (
    <ol className={`flow flow-${variant}`}>
      {steps.map((step, index) => (
        <li className="flow-step" key={step.key}>
          <div className="flow-node">
            <span className="flow-index">{index + 1}</span>
            <span className="flow-label">{step.label}</span>
            <span className="flow-note">{step.note}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function PageIntro({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string
  title: string
  lede: string
  children?: ReactNode
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-lede">{lede}</p>
      {children}
    </div>
  )
}
