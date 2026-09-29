import { COMPANY, DEMO_OUTCOME_LESSON } from '../brand'
import Link from '../components/Link'
import { FlowDiagram, SectionHeading } from '../components/Shell'
import { DemoTag } from '../components/States'

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">{COMPANY.name} · customer support</p>
          <h1 className="hero-title">{COMPANY.product}</h1>
          <p className="hero-positioning">{COMPANY.positioning}</p>
          <p className="hero-lede">
            Traditional AI can answer questions. {COMPANY.product} remembers experiences
            and their outcomes, so a support interaction months from now can draw on what
            your organization has already learned — and stop repeating the approaches that
            already failed.
          </p>
          <div className="hero-actions">
            <Link to="/support" className="btn btn-primary">
              Get Customer Support
            </Link>
            <Link to="/organization" className="btn btn-secondary">
              Explore Organization Intelligence
            </Link>
          </div>
          <p className="hero-footnote">
            Two ways in: the <strong>customer</strong> sees helpful support. The{' '}
            <strong>organization</strong> sees what it is learning.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="How it works"
          title="One conversation becomes organizational knowledge"
          lede="The support agent is the same in both portals. What changes is who is looking, and at what level of detail."
        />
        <FlowDiagram variant="home" />
      </section>

      <section className="section">
        <div className="split-cards">
          <article className="portal-card portal-card-customer">
            <p className="eyebrow">Customer experience</p>
            <h3>Personal, and quietly informed by past cases</h3>
            <ul className="check-list">
              <li>A real support conversation with a named agent, {COMPANY.supportAgent}.</li>
              <li>Answers that reflect what has actually worked at {COMPANY.name}.</li>
              <li>
                Customers confirm whether a case was resolved, which is what makes the
                next answer better.
              </li>
              <li>No internal memory, other customers' details, or analytics are shown.</li>
            </ul>
            <Link to="/support" className="btn btn-soft">
              Open customer support
            </Link>
          </article>

          <article className="portal-card portal-card-org">
            <p className="eyebrow">Organization experience</p>
            <h3>What the support system has learned</h3>
            <ul className="check-list">
              <li>Every interaction and outcome stored as organizational memory.</li>
              <li>Recurring customer signals, derived from real stored experiences.</li>
              <li>A synthesized view of what has worked, what has not, and what to avoid.</li>
              <li>A chronological timeline anyone on the team can audit.</li>
            </ul>
            <Link to="/organization" className="btn btn-soft">
              Open organization intelligence
            </Link>
          </article>
        </div>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="A concrete example"
          title="The second customer should not cost what the first one did"
        />
        <div className="example">
          <div className="example-col">
            <p className="example-tag">First customer · no prior experience</p>
            <p className="example-quote">
              “We need to export 50,000 customer records.”
            </p>
            <p className="example-outcome">
              The agent gives a sound, generic answer. The standard export times out. The
              case is escalated, and the outcome gets recorded.
            </p>
          </div>
          <div className="example-col example-col-accent">
            <p className="example-tag">Later customer · same problem</p>
            <p className="example-quote">“We need to export 50,000 records.”</p>
            <p className="example-outcome">
              {COMPANY.product} recalls the earlier case, tells the customer what failed
              before, and recommends the approach that worked.
            </p>
          </div>
        </div>
        <p className="example-lesson">
          Example lesson retained from that case: “{DEMO_OUTCOME_LESSON}”
        </p>
      </section>

      <section className="section">
        <div className="closing-band">
          <div>
            <h2>See the whole loop in about a minute</h2>
            <p>
              Ask a question, record the outcome, ask a near-identical question, then open
              the Organization view to see where the experience went.
            </p>
          </div>
          <div className="closing-actions">
            <Link to="/support" className="btn btn-primary">
              Start with the customer
            </Link>
            <Link to="/organization" className="btn btn-secondary">
              See the organization side
            </Link>
          </div>
        </div>
        <p className="disclaimer-line">
          <DemoTag /> {COMPANY.product} is an experimental system built by{' '}
          {COMPANY.name} to demonstrate persistent organizational memory. The support
          environment is simulated — see <Link to="/about">About</Link> for the distinction.
        </p>
      </section>
    </>
  )
}
