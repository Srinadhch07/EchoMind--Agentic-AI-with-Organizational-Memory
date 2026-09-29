/**
 * Thridha Labs brand constants and the DEMO product catalogue.
 *
 * IMPORTANT: everything in DEMO_TOPICS below is SIMULATED demo content created for
 * this EchoMind demonstration. It is not a description of commercially available
 * Thridha Labs products. The support agent is prompted with these topics so the
 * simulated environment stays internally consistent; customers can of course ask
 * about anything, these are only the suggested starting points.
 */

export const COMPANY = {
  name: 'Thridha Labs',
  mark: 'TL',
  tagline: 'Building AI products that solve real-world problems.',
  supportAgent: 'EchoMind',
  product: 'EchoMind',
  positioning: 'AI support that remembers what your organization learns.',
} as const

export const DEMO_DISCLAIMER =
  'Simulated Thridha Labs environment. Product names and details below are demo content for the EchoMind demonstration, not an official Thridha Labs catalogue.'

export interface DemoTopic {
  id: string
  product: string
  category: string
  blurb: string
  questions: string[]
}

/** Simulated catalogue. See DEMO_DISCLAIMER. */
export const DEMO_TOPICS: DemoTopic[] = [
  {
    id: 'exports',
    product: 'Data exports',
    category: 'Product usage',
    blurb: 'Bulk exports, scheduled jobs, and download delivery.',
    questions: [
      'We need to export 50,000 customer records. What is the fastest way to do that?',
      'My export job failed halfway through. What should I do?',
    ],
  },
  {
    id: 'agents',
    product: 'Thridha Agents',
    category: 'AI agents',
    blurb: 'Build, configure, and deploy AI agents on your data.',
    questions: [
      'How do I build and deploy my first agent?',
      'How do I connect an agent to our internal tools and APIs?',
    ],
  },
  {
    id: 'api',
    product: 'Developer API & SDK',
    category: 'APIs & integrations',
    blurb: 'API keys, webhooks, rate limits, and SDKs.',
    questions: [
      'Where do I find my API key, and what are the current rate limits?',
      'Our webhooks stopped firing. How do I debug the delivery?',
    ],
  },
  {
    id: 'flow',
    product: 'Thridha Flow',
    category: 'AI products',
    blurb: 'Workflow automation across your support and operations stack.',
    questions: [
      'How do I automate a workflow when a ticket is escalated?',
      'Can a Flow step call our own REST endpoint?',
    ],
  },
  {
    id: 'insights',
    product: 'Thridha Insights',
    category: 'Analytics',
    blurb: 'Dashboards, reports, and scheduled summaries.',
    questions: [
      'How do I build a weekly report for our support queue?',
      'Can I share an Insights dashboard with my team?',
    ],
  },
  {
    id: 'research',
    product: 'Research Lab',
    category: 'Research & AI tools',
    blurb: 'Notebooks, model evaluation, and prompt experiments.',
    questions: [
      'How do I compare two models on our own dataset?',
      'Where are the evaluation notebooks stored?',
    ],
  },
  {
    id: 'account',
    product: 'Account & billing',
    category: 'Account',
    blurb: 'Seats, invoices, and access management.',
    questions: [
      'How do I add a teammate to our workspace?',
      'Where can I download our latest invoice?',
    ],
  },
]

/** The export scenario that makes the organizational-memory loop visible in a demo. */
export const DEMO_FIRST_QUESTION = DEMO_TOPICS[0].questions[0]
export const DEMO_SIMILAR_QUESTION = 'We need to export 50,000 records.'

export const DEMO_OUTCOME_LESSON =
  'The standard CSV export timed out on a request this size. A background batched export that runs in chunks and emails a secure download link worked.'

/**
 * Public navigation.
 *
 * /organization is deliberately absent. It is the admin control plane and is not
 * a public page, so it is reached from the footer or by typing the URL, and it
 * redirects to /admin/login unless the backend confirms a session.
 */
export const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/why-echomind', label: 'Why EchoMind' },
  { to: '/support', label: 'Customer Support' },
  { to: '/about', label: 'About' },
] as const
