import type { ReactNode } from 'react'
import Link from './Link'
import { type RouteId } from '../router'
import { COMPANY, NAV_LINKS } from '../brand'

interface Props {
  route: RouteId
}

export default function Navigation({ route }: Props) {
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
              aria-current={route === link.to.replace(/\/$/, '') || (link.to === '/' && route === 'home') ? 'page' : undefined}
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
