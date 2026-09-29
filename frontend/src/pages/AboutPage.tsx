import { COMPANY, DEMO_DISCLAIMER, DEMO_TOPICS } from '../brand'
import Link from '../components/Link'
import { SectionHeading } from '../components/Shell'
import { DemoTag } from '../components/States'

export default function AboutPage() {
  return (
    <div className="page page-about">
      <section className="about-hero">
        <p className="eyebrow">About</p>
        <h1 className="about-title">{COMPANY.name}</h1>
        <p className="about-positioning">“{COMPANY.tagline}”</p>
        <p className="about-lede">
          {COMPANY.name} is an AI and product lab focused on building practical AI systems,
          tools, and products — software designed to do real work rather than to demo well.
          This repository is one of its experiments: a support agent that gets measurably
          better because the organization remembers.
        </p>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="The product"
          title={COMPANY.product}
          lede="An experimental customer-support intelligence system demonstrating how AI agents can learn from organizational experience through persistent memory."
        />
        <div className="prose">
          <p>
            Most AI assistants are stateless. They are excellent at the conversation in front
            of them and contribute nothing to the company that deployed them. The knowledge
            that should have accumulated — what broke, what fixed it, which approach the
            team stopped trusting — stays scattered across tickets and people.
          </p>
          <p>
            {COMPANY.product} keeps that knowledge in one place. Each support interaction is
            stored as an experience. When the outcome is known, it is stored as a lesson. On
            the next similar request, the agent recalls the relevant experience before it
            answers, and steers away from approaches the organization has already seen fail.
          </p>
          <p>
            The model itself is never retrained. Learning happens in the memory layer, which
            means a new lesson is available to the very next customer, and anyone on the team
            can read, question, or correct it.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="split-cards split-cards-tight">
          <article className="portal-card portal-card-real">
            <h3>What is real</h3>
            <ul className="check-list">
              <li>
                The agent architecture: memory recall, LLM reasoning, response, outcome
                capture, and retention into persistent memory.
              </li>
              <li>
                The integrations: Groq for inference, Hindsight for persistent
                organizational memory.
              </li>
              <li>
                The behavior: recalled experience demonstrably changes the answer, verified
                against a control answer with memory withheld.
              </li>
              <li>
                First-run handling, error transparency, and the verification scripts in
                <code> backend/tests/</code>.
              </li>
            </ul>
          </article>
          <article className="portal-card portal-card-sim">
            <h3>What is simulated</h3>
            <ul className="check-list">
              <li>
                The customer support environment itself: this is a demo support desk, not
                {COMPANY.name}&apos;s real customer base.
              </li>
              <li>
                All product names, categories, and suggested questions in the support view
                are invented for the demonstration.
              </li>
              <li>
                Customer names and messages are illustrative. No real customer data is used.
              </li>
              <li>
                The organization dashboard shows only what the running system has actually
                stored. There are no seeded or hard-coded metrics.
              </li>
            </ul>
          </article>
        </div>
        <p className="disclaimer-line">
          <DemoTag /> {DEMO_DISCLAIMER}
        </p>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Two audiences, one agent"
          title="Why the product has two front doors"
        />
        <div className="prose">
          <p>
            <strong>Customer support</strong> is where learning has to be felt. A customer
            should get a specific, useful answer that reflects what actually worked at{' '}
            {COMPANY.name} — and should never see internal memory, other customers&apos;
            details, or organizational analytics. The customer experience is built to make
            that boundary invisible: the answer just gets better.
          </p>
          <p>
            <strong>Organization intelligence</strong> is where the value compounds. Support
            leads need to see what customers keep hitting, which approaches keep failing, and
            what the organization now knows that it did not know last month. That view is
            aggregated and sanitized: it is the company&apos;s own operational knowledge, not
            a transcript archive.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Demonstration catalogue"
          title="Simulated products in this demo"
          lede="Invented for the demonstration so the support experience stays internally consistent."
        />
        <ul className="about-catalog">
          {DEMO_TOPICS.map((topic) => (
            <li key={topic.id}>
              <div className="about-catalog-head">
                <span className="about-catalog-name">{topic.product}</span>
                <span className="about-catalog-cat">{topic.category}</span>
              </div>
              <p>{topic.blurb}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="closing-band">
          <div>
            <h2>Try it</h2>
            <p>
              Open the customer view, ask a question, record the outcome, then ask a
              near-identical question. The second answer should not be the first one.
            </p>
          </div>
          <div className="closing-actions">
            <Link to="/support" className="btn btn-primary">
              Open customer support
            </Link>
            <Link to="/organization" className="btn btn-secondary">
              Organization intelligence
            </Link>
          </div>
        </div>
        <p className="powered-line">Powered by {COMPANY.name}</p>
      </section>
    </div>
  )
}
