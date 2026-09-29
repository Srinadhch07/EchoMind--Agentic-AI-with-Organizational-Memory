import { useState } from 'react'
import { COMPANY } from '../brand'
import Link from '../components/Link'
import { SectionHeading } from '../components/Shell'
import TestimonialSection from '../components/TestimonialSection'

/**
 * Public explanation of EchoMind for a mixed, largely non-technical audience.
 *
 * Content rules applied throughout this page:
 *   - Plain language. No vector-embedding, retrieval-augmented or fine-tuning
 *     vocabulary, and no claim that the model itself is being trained.
 *   - Only customer support is implemented. Every other team is labelled as a
 *     possible future application so the page cannot overstate what exists.
 *   - The worked example is illustrative page content. It is not wired into the
 *     agent and is not a real customer record.
 *   - No invented statistics, no customer logos, no fake testimonials.
 */

const STORY_WITHOUT = [
  'A customer reports a problem.',
  'Your support team tries one solution.',
  "It doesn't work.",
  'They discover what actually works.',
  'But weeks later, another customer has the same problem.',
  'The organization knows the answer — the new agent may not.',
]

const FLOW_USUAL = [
  'Customer Problem',
  'Team Response',
  'Outcome',
  'Lesson Learned',
  'Usually forgotten',
]

const FLOW_ECHOMIND = [
  'Customer Problem',
  'Team Response',
  'Outcome',
  'Lesson Learned',
  'EchoMind remembers',
  'Future agent uses the lesson',
]

const AGENT_LOOP = [
  'Experience',
  'Memory',
  'Recall',
  'Reasoning',
  'Action',
  'Outcome',
  'Memory',
]

const WITHOUT_ECHOMIND = [
  'Experience',
  'Solution discovered',
  'Conversation ends',
  'Knowledge may be forgotten',
  'Similar problem appears',
  'Start again',
]

const WITH_ECHOMIND = [
  'Experience',
  'Outcome',
  'Lesson captured',
  'Organizational memory',
  'Similar problem appears',
  'Relevant lesson recalled',
  'Better-informed response',
]

const TEAMS = [
  {
    name: 'Customer Support',
    body: 'Remember which solutions worked for similar customer problems.',
    benefit: 'Faster, more consistent support.',
    status: 'implemented' as const,
  },
  {
    name: 'Sales',
    body: 'Remember customer objections, preferences, and what worked in previous conversations.',
    benefit: 'Sales agents can use organizational experience when preparing future interactions.',
    status: 'future' as const,
  },
  {
    name: 'Product Teams',
    body: 'See patterns across customer problems and repeated requests.',
    benefit: 'Turn repeated experiences into product insight.',
    status: 'future' as const,
  },
  {
    name: 'Engineering',
    body: 'Remember previous incidents, failed fixes, and successful resolutions.',
    benefit: 'Future incidents can start with organizational experience instead of starting from zero.',
    status: 'future' as const,
  },
  {
    name: 'Operations',
    body: 'Remember what happened during previous operational problems.',
    benefit: 'Make repeat workflows easier and more consistent.',
    status: 'future' as const,
  },
]

const ORG_BRANCHES = ['Customer Support', 'Sales', 'Product', 'Engineering', 'Operations']

const FUTURE_AGENTS = ['Customer Support Agent', 'Sales Agent', 'Product Agent', 'Engineering Agent']

const ORG_BENEFITS = [
  {
    title: 'Less Relearning',
    body: "Teams don't have to rediscover the same solution repeatedly.",
  },
  {
    title: 'Faster Decisions',
    body: 'AI agents can start with relevant previous experience.',
  },
  {
    title: 'Consistent Support',
    body: 'Customers with similar problems can benefit from lessons learned previously.',
  },
  {
    title: 'Organizational Knowledge',
    body: "Useful experience doesn't have to remain trapped inside individual conversations.",
  },
  {
    title: 'Better AI Agents',
    body: 'Agents can become more useful as the organization accumulates experience.',
  },
]

const CUSTOMER_BENEFITS = [
  {
    title: "You don't have to explain the same problem again.",
    body: 'Where organizational memory is available, an AI agent can use relevant previous experience.',
  },
  {
    title: 'Support can learn from previous outcomes.',
    body: 'If one approach failed before, the agent can avoid blindly repeating it.',
  },
  {
    title: 'Similar problems can receive more informed help.',
    body: 'Previous successful resolutions can guide future responses.',
  },
]

const INTEGRATIONS = [
  'Customer support systems',
  'CRM',
  'Help desk',
  'Internal knowledge systems',
  'Product feedback systems',
  'Engineering and incident systems',
]

/** Vertical step list used for the two side-by-side flows and the comparison. */
function StepList({ steps, tone }: { steps: string[]; tone: 'plain' | 'memory' }) {
  return (
    <ol className={`step-list step-list-${tone}`}>
      {steps.map((step, index) => (
        <li className="step-item" key={`${step}-${index}`}>
          <span className="step-index">{index + 1}</span>
          <span className="step-label">{step}</span>
        </li>
      ))}
    </ol>
  )
}

export default function WhyEchoMindPage() {
  const [stage, setStage] = useState<'day1' | 'day30'>('day1')

  return (
    <div className="page page-why">
      {/* 1. Hero */}
      <section className="why-hero">
        <p className="eyebrow">Why EchoMind</p>
        <h1 className="why-hero-title">AI that remembers what your organization learns.</h1>
        <p className="why-hero-lede">
          Every customer interaction teaches your team something. {COMPANY.product} helps AI
          agents remember those lessons and use them when similar situations happen again.
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#how-it-works">
            See How It Works
          </a>
          <a className="btn btn-soft" href="#experiences">
            Share Your Experience
          </a>
        </div>
        <p className="why-hero-foot">
          Written for business owners, support managers, customers and developers. No technical
          background needed.
        </p>
      </section>

      {/* 2. The problem */}
      <section className="section" id="the-problem">
        <SectionHeading
          eyebrow="The problem"
          title="Organizations keep relearning the same lessons"
          lede="The knowledge usually exists. It just does not survive the conversation."
        />

        <ol className="story-list">
          {STORY_WITHOUT.map((line, index) => (
            <li className="story-line" key={line}>
              <span className="story-step" aria-hidden="true">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>

        <div className="prose why-prose">
          <p>
            Important knowledge often lives inside conversations, tickets, spreadsheets,
            people&apos;s memories, and disconnected systems.
          </p>
          <p>
            <strong>{COMPANY.product} turns those experiences into reusable organizational
            memory.</strong>
          </p>
        </div>

        <div className="example two-col-example">
          <div className="example-col">
            <p className="example-tag">What usually happens</p>
            <StepList steps={FLOW_USUAL} tone="plain" />
          </div>
          <div className="example-col example-col-accent">
            <p className="example-tag">With {COMPANY.product}</p>
            <StepList steps={FLOW_ECHOMIND} tone="memory" />
          </div>
        </div>
      </section>

      {/* 3. What is EchoMind */}
      <section className="section" id="how-it-works">
        <SectionHeading
          eyebrow="In simple terms"
          title={`What is ${COMPANY.product}?`}
        />
        <div className="prose why-prose">
          <p>
            <strong>{COMPANY.product} gives AI agents a memory of what the organization has
            learned.</strong>
          </p>
          <p>
            It doesn&apos;t just remember conversations. It remembers useful experiences — what
            happened, what was tried, what worked, and what didn&apos;t.
          </p>
          <p>That means every useful experience can help the next interaction.</p>
        </div>

        <div className="example two-col-example">
          <div className="example-col">
            <p className="example-tag">A normal AI agent</p>
            <p className="example-quote">Ask → Answer</p>
            <p className="example-outcome">
              Useful in the moment, then the conversation is gone.
            </p>
          </div>
          <div className="example-col example-col-accent">
            <p className="example-tag">{COMPANY.product}</p>
            <p className="example-quote">Experience → Remember → Recall → Learn → Help again</p>
            <p className="example-outcome">
              Each useful case can make the next one better.
            </p>
          </div>
        </div>

        <div className="learned-summary why-note">
          <p>
            <strong>One thing to be clear about:</strong> {COMPANY.product} does not retrain or
            modify the AI model. It keeps a separate, long-lived store of experience — what we
            call organizational memory — and looks things up there when answering. A new lesson
            becomes available immediately, without any retraining step.
          </p>
        </div>
      </section>

      {/* 4. Where it fits */}
      <section className="section" id="architecture">
        <SectionHeading
          eyebrow="Where it fits"
          title="It sits alongside the tools you already use"
          lede="EchoMind doesn't have to replace the tools your organization already uses."
        />

        <div className="arch" role="img" aria-label="Diagram: teams at the top feed into EchoMind memory, which AI agents and systems read from.">
          <p className="arch-tier arch-tier-org">Organization</p>
          <div className="arch-branches">
            {ORG_BRANCHES.map((branch) => (
              <span className="arch-branch" key={branch}>
                {branch}
              </span>
            ))}
          </div>
          <p className="arch-arrow" aria-hidden="true">
            ↓
          </p>
          <p className="arch-tier arch-tier-memory">
            {COMPANY.product} memory
            <span>organizational memory of what was learned</span>
          </p>
          <p className="arch-arrow" aria-hidden="true">
            ↓
          </p>
          <p className="arch-tier arch-tier-agents">AI agents and systems</p>
        </div>

        <div className="prose why-prose">
          <p>
            It can become a memory layer that helps AI agents learn from experiences across
            workflows — sitting next to the systems your teams already depend on, rather than
            asking anyone to move.
          </p>
        </div>

        <div className="panel why-panel">
          <p className="panel-title">Possible future integrations</p>
          <ul className="check-list">
            {INTEGRATIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="panel-note">
            <strong>These are possible future integrations, not existing integrations.</strong>{' '}
            Today {COMPANY.product} is built and demonstrated for customer support only.
          </p>
        </div>
      </section>

      {/* 5. Who can use it */}
      <section className="section" id="who">
        <SectionHeading
          eyebrow="Who can use it"
          title="Where organizational memory helps"
        />
        <ul className="team-grid">
          {TEAMS.map((team) => (
            <li className="team-card" key={team.name}>
              <div className="team-head">
                <h3 className="team-name">{team.name}</h3>
                {team.status === 'implemented' ? (
                  <span className="status-pill status-live">Working today</span>
                ) : (
                  <span className="status-pill">Possible future use</span>
                )}
              </div>
              <p className="team-body">{team.body}</p>
              <p className="team-benefit">
                <span>Benefit</span>
                {team.benefit}
              </p>
            </li>
          ))}
        </ul>
        <p className="disclaimer-line">
          Only customer support is implemented today. Sales, product, engineering and
          operations describe where the same organizational-memory approach could be applied
          next.
        </p>
      </section>

      {/* 6. Benefits to the organization */}
      <section className="section" id="org-benefits">
        <SectionHeading
          eyebrow="For the organization"
          title="What changes when an organization remembers?"
        />
        <ul className="benefit-grid">
          {ORG_BENEFITS.map((benefit) => (
            <li className="benefit-card" key={benefit.title}>
              <h3 className="benefit-title">{benefit.title}</h3>
              <p className="benefit-body">{benefit.body}</p>
            </li>
          ))}
        </ul>
        <p className="disclaimer-line">
          These describe intended direction. No specific improvement percentages or guarantees
          are claimed.
        </p>
      </section>

      {/* 7. Benefits to customers */}
      <section className="section" id="customer-benefits">
        <SectionHeading
          eyebrow="For the customer"
          title="What a customer actually notices"
        />
        <ul className="quote-list quote-list-benefits">
          {CUSTOMER_BENEFITS.map((benefit) => (
            <li className="quote-card" key={benefit.title}>
              <p className="quote-title">{benefit.title}</p>
              <p className="quote-body">{benefit.body}</p>
            </li>
          ))}
        </ul>
        <div className="learned-summary why-note">
          <p>
            Memory is only used when it is relevant. A past case about a different problem does
            not get pulled into an unrelated answer.
          </p>
        </div>
      </section>

      {/* 8. Real-world example */}
      <section className="section" id="example">
        <SectionHeading
          eyebrow="A simple example"
          title="Imagine this happens in your company."
        />

        <div className="stage-switch" role="group" aria-label="Choose a day in the example">
          <button
            type="button"
            className={`stage-btn${stage === 'day1' ? ' stage-btn-active' : ''}`}
            aria-pressed={stage === 'day1'}
            onClick={() => setStage('day1')}
          >
            Day 1
          </button>
          <button
            type="button"
            className={`stage-btn${stage === 'day30' ? ' stage-btn-active' : ''}`}
            aria-pressed={stage === 'day30'}
            onClick={() => setStage('day30')}
          >
            Day 30
          </button>
        </div>

        {stage === 'day1' ? (
          <ol className="dialog">
            <li className="dialog-line dialog-customer">
              <span className="dialog-who">Customer</span>
              <p className="dialog-text">“Our export of 50,000 records keeps timing out.”</p>
            </li>
            <li className="dialog-line dialog-agent">
              <span className="dialog-who">Support</span>
              <p className="dialog-text">“Let&apos;s try the standard CSV export.”</p>
            </li>
            <li className="dialog-line dialog-result">
              <span className="dialog-who">Result</span>
              <p className="dialog-text">“Timed out.”</p>
            </li>
            <li className="dialog-line dialog-note">
              <span className="dialog-who">The team finds out</span>
              <p className="dialog-text">
                A background, batched export works better.
              </p>
            </li>
          </ol>
        ) : (
          <ol className="dialog">
            <li className="dialog-line dialog-customer">
              <span className="dialog-who">Customer</span>
              <p className="dialog-text">“We need to export 50,000 records.”</p>
            </li>
            <li className="memory-card">
              <p className="memory-card-head">
                <span className="memory-card-mark" aria-hidden="true">
                  &#129504;
                </span>
                {COMPANY.product} remembers
              </p>
              <p className="memory-card-body">
                “Large exports can time out with direct CSV generation. Background, batched
                exports worked better.”
              </p>
            </li>
            <li className="dialog-line dialog-agent">
              <span className="dialog-who">{COMPANY.product}</span>
              <p className="dialog-text">
                “Previous cases with exports at this scale experienced timeouts with direct CSV
                generation. A background, batched export worked better.”
              </p>
            </li>
          </ol>
        )}

        <div className="prose why-prose">
          <p>
            The second customer didn&apos;t benefit from the first customer&apos;s experience by
            coincidence. The organization had already learned something — EchoMind made that
            lesson available.
          </p>
        </div>
        <p className="disclaimer-line">
          This example is illustrative content on this page. It is not hard-coded into the
          support agent.
        </p>
      </section>

      {/* 9. Before / with */}
      <section className="section" id="comparison">
        <SectionHeading
          eyebrow="A factual comparison"
          title="The same work, with and without a memory layer"
        />
        <div className="example two-col-example">
          <div className="example-col">
            <p className="example-tag">Without {COMPANY.product}</p>
            <StepList steps={WITHOUT_ECHOMIND} tone="plain" />
          </div>
          <div className="example-col example-col-accent">
            <p className="example-tag">With {COMPANY.product}</p>
            <StepList steps={WITH_ECHOMIND} tone="memory" />
          </div>
        </div>
        <p className="disclaimer-line">
          Both columns describe real ways work can go. The difference is whether the lesson is
          written down somewhere the next agent can reach.
        </p>
      </section>

      {/* 10. Not just a chatbot */}
      <section className="section" id="not-a-chatbot">
        <SectionHeading
          eyebrow="Not just a chatbot"
          title="The important part is the learning loop"
        />
        <div className="prose why-prose">
          <p>
            {COMPANY.product} is not designed to be another chatbot that simply answers
            questions. The important part is what happens after the conversation ends.
          </p>
        </div>
        <ol className="loop-strip">
          {AGENT_LOOP.map((step, index) => (
            <li
              className={`loop-step${index === AGENT_LOOP.length - 1 ? ' loop-step-return' : ''}`}
              key={`${step}-${index}`}
            >
              <span className="loop-step-label">{step}</span>
            </li>
          ))}
        </ol>
        <div className="prose why-prose">
          <p>
            The value grows as useful organizational experiences accumulate. It does not happen
            automatically or without limit — it depends on cases being recorded and outcomes
            being known.
          </p>
        </div>
      </section>

      {/* 11. The future */}
      <section className="section" id="future">
        <SectionHeading
          eyebrow="The future"
          title="One organizational memory. Many AI agents."
        />
        <div className="future-stack">
          {FUTURE_AGENTS.map((agent) => (
            <div className="future-agent" key={agent}>
              <span className="future-agent-name">{agent}</span>
              <span className="future-agent-link" aria-hidden="true">
                ↕
              </span>
            </div>
          ))}
          <div className="future-memory">
            <span className="future-memory-name">{COMPANY.product} memory</span>
            <span className="future-memory-note">one shared organizational memory</span>
          </div>
        </div>
        <div className="prose why-prose">
          <p>
            Different agents can learn from the same organizational experience. A support agent
            discovering that customers repeatedly struggle with a feature could make that
            knowledge useful to a product agent. A sales agent could use customer preferences
            learned earlier. An engineering agent could use lessons from previous incidents.
          </p>
        </div>
        <p className="disclaimer-line">
          This is a future architecture direction. Today {COMPANY.product} is built and
          demonstrated for customer support only.
        </p>
      </section>

      {/* 12 + 13. Testimonials */}
      <section className="section" id="experiences">
        <SectionHeading
          eyebrow="Experiences"
          title="What do people think about EchoMind?"
          lede="Testimonials are submitted voluntarily and reviewed before they appear here."
        />
        <TestimonialSection />
      </section>

      {/* 16. Final CTA */}
      <section className="section" id="get-started">
        <div className="closing-band">
          <div>
            <h2>Organizations learn every day.</h2>
            <p>EchoMind helps their AI agents remember.</p>
          </div>
          <div className="closing-actions">
            <Link to="/support" className="btn btn-primary">
              Try EchoMind
            </Link>
            <a className="btn btn-secondary" href="#experiences">
              Share Your Experience
            </a>
          </div>
        </div>
        <p className="powered-line">Powered by {COMPANY.name}</p>
      </section>
    </div>
  )
}
