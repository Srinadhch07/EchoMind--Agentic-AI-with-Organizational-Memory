import type { TimelineEntry } from '../types'

/**
 * Helpers for turning the organization-facing API payloads into displayable,
 * privacy-conscious pieces of UI.
 *
 * Everything here is derived from real data returned by /api/agent/timeline and
 * /api/agent/learned. Nothing is invented, estimated, or counted on the server's
 * behalf: counts come from the entries the backend actually returned.
 */

/**
 * Hindsight does not return the raw string that was written. It decomposes each
 * retained document into atomic memories, so an entry's `lessons` list holds
 * several short statements such as:
 *
 *   "Priya needs to export 50,000 records from EchoMind. | When: 2026-09-29 | Involving: Priya"
 *   "EchoMind recommends using the bulk export tool ... to avoid timeouts."
 *
 * These helpers split that back into a problem and an action without inventing
 * any text of their own.
 */

const METADATA_SEGMENTS = new Set([
  'when',
  'involving',
  'to',
  'standard',
  'source',
  'regarding',
  'context',
  'note',
])

/** Strip Hindsight's trailing "| When: ... | Involving: ..." annotations. */
function cleanMemory(text: string): string {
  const parts = text.split(' | ')
  const kept: string[] = []
  for (const part of parts) {
    const firstWord = part.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (METADATA_SEGMENTS.has(firstWord) && kept.length > 0) break
    if (kept.length > 0) break
    kept.push(part.trim())
  }
  return kept.join('').trim()
}

/**
 * Defence in depth for the organization view. The backend does not store customer
 * email addresses, but any email-shaped or internal-identifier-shaped text that
 * reaches the dashboard is masked before it is rendered.
 */
export function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[contact redacted]')
    .replace(/\b(?:echomind|outcome)-[0-9a-f]{8,}\b/gi, '[record]')
}

const AGENT_LEAD = /^(echomind|the agent)\b/i
const PROBLEM_HINT =
  /\b(need|needs|issue|problem|failed|failure|timeout|timed out|error|dissatisf|received|expected)\b/i

export interface ParsedExperience {
  problem: string
  action: string
}

/**
 * Best problem / action pair for one stored experience, chosen from the atomic
 * memories that belong to it. The agent line is the action (or, for an outcome
 * entry, the lesson); the remaining line that best describes the trouble is the
 * problem.
 */
export function parseExperience(lessons: string[]): ParsedExperience {
  const lines = lessons.map(cleanMemory).filter((line) => line.length > 0)
  if (lines.length === 0) return { problem: '', action: '' }

  const agentLines = lines.filter((line) => AGENT_LEAD.test(line))
  const otherLines = lines.filter((line) => !AGENT_LEAD.test(line))

  const problem = otherLines.find((line) => PROBLEM_HINT.test(line)) ?? otherLines[0] ?? lines[0]
  const action = agentLines[0] ?? ''

  return { problem: redact(problem), action: redact(action) }
}

/** True when the entry came from POST /api/agent/outcome rather than an interaction. */
export function isOutcomeEntry(entry: TimelineEntry): boolean {
  return entry.source === 'echomind-outcome' || entry.id.startsWith('outcome-')
}

/**
 * Render a timestamp for humans.
 *
 * Accepts `undefined` as well as `null` because the admin types model an
 * unmeasured or absent timestamp as either, and this is the one place that
 * formats them all.
 */
export function formatWhen(value: string | null | undefined): string {
  if (!value) return 'Time not recorded'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Time not recorded'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface CustomerSignal {
  label: string
  count: number
  evidence: string[]
}

/**
 * Recurring themes, counted directly from the stored experience text.
 *
 * This is keyword matching over real memory content, so it is deterministic and
 * auditable: the count is the number of stored experiences that mention the theme,
 * and each signal carries the experiences it was found in.
 */
const SIGNAL_THEMES: { label: string; terms: string[] }[] = [
  { label: 'Data exports', terms: ['export'] },
  { label: 'Timeouts and failures', terms: ['timeout', 'timed out', 'failed', 'failure', 'error'] },
  { label: 'Batch and background processing', terms: ['batch', 'background', 'chunk'] },
  { label: 'API and webhooks', terms: ['api', 'webhook', 'endpoint', 'rate limit'] },
  {
    label: 'Authentication and access',
    terms: ['login', 'log in', 'sign in', 'api key', 'permission', 'access'],
  },
  { label: 'Integrations', terms: ['integration', 'integrate', 'connect'] },
  { label: 'Billing and seats', terms: ['invoice', 'billing', 'seat', 'plan'] },
  { label: 'Agents', terms: ['agent'] },
  { label: 'Dashboards and reports', terms: ['dashboard', 'report'] },
  { label: 'Refunds and replacements', terms: ['refund', 'replacement', 'return'] },
]

export function deriveSignals(entries: TimelineEntry[]): CustomerSignal[] {
  const signals: CustomerSignal[] = []

  for (const theme of SIGNAL_THEMES) {
    const evidence: string[] = []
    for (const entry of entries) {
      const haystack = entry.lessons.join(' ').toLowerCase()
      if (!theme.terms.some((term) => haystack.includes(term))) continue
      const { problem } = parseExperience(entry.lessons)
      const snippet = problem.length > 120 ? `${problem.slice(0, 117)}...` : problem
      if (snippet && !evidence.includes(snippet)) evidence.push(snippet)
    }
    if (evidence.length > 0) signals.push({ label: theme.label, count: evidence.length, evidence })
  }

  return signals.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export interface MemoryTotals {
  experiences: number
  outcomes: number
  lessons: number
  customers: number
}

/** Real counts computed from the entries the timeline endpoint returned. */
export function memoryTotals(entries: TimelineEntry[]): MemoryTotals {
  const customers = new Set<string>()
  let outcomes = 0
  let lessons = 0

  for (const entry of entries) {
    if (isOutcomeEntry(entry)) outcomes += 1
    lessons += entry.lessons.length
    if (entry.customer) customers.add(entry.customer)
  }

  return {
    experiences: entries.length,
    outcomes,
    lessons,
    customers: customers.size,
  }
}
