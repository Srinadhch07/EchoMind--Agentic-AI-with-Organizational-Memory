import type {
  HealthResponse,
  LearnedResponse,
  OutcomeResponse,
  SupportReply,
  TestimonialCreatedResponse,
  TestimonialListResponse,
  TimelineResponse,
} from './types'

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

const API_ORIGIN = BASE_URL || 'the Vite dev server (/api is proxied)'

function describeHttpError(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown })?.detail ?? body
  let message: string

  if (typeof detail === 'string') {
    message = detail
  } else if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    const upstream = d.hindsight_response
    let upstreamText = ''
    if (upstream && typeof upstream === 'object') {
      const u = upstream as Record<string, unknown>
      upstreamText = typeof u.detail === 'string' ? u.detail : JSON.stringify(u)
    } else if (typeof upstream === 'string') {
      upstreamText = upstream
    }
    const parts: string[] = []
    if (typeof d.error === 'string') parts.push(d.error)
    if (typeof upstreamText === 'string' && upstreamText) {
      parts.push(`Hindsight said: ${upstreamText}`)
    }
    message = parts.length ? parts.join(' — ') : JSON.stringify(detail)
  } else {
    message = String(detail)
  }

  return `Backend responded ${status}: ${message}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new Error(
      `No response from the EchoMind backend at ${API_ORIGIN}. The request never reached it — check that the server is running.`,
    )
  }

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = await res.text().catch(() => '')
    }
    throw new Error(describeHttpError(res.status, body))
  }

  return (await res.json()) as T
}

/**
 * POST /api/agent/respond
 *
 * The backend envelope carries memories_used, reasoning and raw_memories. Those are
 * internal organizational data, so the response is narrowed here to the customer-safe
 * projection before it leaves this module. This is the customer's privacy boundary.
 */
async function askSupportAgent(
  customer: string,
  message: string,
  email: string,
): Promise<SupportReply> {
  const res = await request<{
    customer: string
    response: string
  }>('/api/agent/respond', {
    method: 'POST',
    body: JSON.stringify({ customer, message, customer_email: email }),
  })
  return { customer: res.customer, response: res.response }
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  /** Customer support: ask EchoMind a question. Customer-safe result only. */
  support: askSupportAgent,

  /**
   * Record how a support case actually went, so it becomes organizational memory.
   *
   * The `customer_email` field is accepted by the backend for support traceability
   * and is deliberately not part of the retained memory.
   */
  recordOutcome: (input: {
    customer: string
    email: string
    lesson: string
    scenario?: string
  }) =>
    request<OutcomeResponse>('/api/agent/outcome', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.customer,
        customer_email: input.email,
        lesson: input.lesson,
        scenario: input.scenario ?? 'Thridha Labs support case outcome',
      }),
    }),

  /** Organization surface: what has EchoMind learned across all cases? */
  learned: (question?: string) =>
    request<LearnedResponse>('/api/agent/learned', {
      method: 'POST',
      body: JSON.stringify({ question: question ?? null }),
    }),

  /** Organization surface: chronological organizational memory. */
  timeline: () => request<TimelineResponse>('/api/agent/timeline'),

  /**
   * Public testimonial list.
   *
   * The backend only returns approved, permission-given entries and never
   * includes an email address, so nothing is filtered here.
   */
  testimonials: () => request<TestimonialListResponse>('/api/testimonials'),

  /**
   * Submit a testimonial.
   *
   * Submissions are stored as pending and are not published. The response
   * confirms the pending state rather than claiming the entry is now public.
   */
  submitTestimonial: (input: {
    name: string
    testimonial: string
    role?: string
    organization?: string
    email?: string
  }) =>
    request<TestimonialCreatedResponse>('/api/testimonials', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        testimonial: input.testimonial,
        role: input.role?.trim() || null,
        organization: input.organization?.trim() || null,
        email: input.email?.trim() || null,
        permission: true,
      }),
    }),
}
