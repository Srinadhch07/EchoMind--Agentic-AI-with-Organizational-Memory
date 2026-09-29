import type {
  AdminIdentity,
  AdminMemoryListResponse,
  AdminMemoryResponse,
  AdminMemoryStats,
  AdminOverview,
  AdminSystemInfo,
  AdminTestimonialActionResponse,
  AdminTestimonialListResponse,
  HealthResponse,
  LearnedResponse,
  OutcomeResponse,
  SupportReply,
  TestimonialCreatedResponse,
  TestimonialListResponse,
  TimelineEntry,
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

/**
 * An error that carries the HTTP status.
 *
 * The status is kept so the admin UI can tell an authentication failure (401/503)
 * apart from a backend outage (0) or an upstream Hindsight error (502), instead
 * of rendering every failure as "could not reach the backend".
 */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      // The admin session is an HTTP-only cookie, so the browser has to be told
      // to include it. Same-origin in dev, because Vite proxies /api.
      credentials: 'include',
      ...init,
    })
  } catch {
    // Network-level failure only: the request never reached the backend.
    throw new ApiError(
      0,
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
    // A real HTTP status came back, so the backend did answer. Report what it
    // said rather than falling back to a connectivity message.
    throw new ApiError(res.status, describeHttpError(res.status, body))
  }

  return (await res.json()) as T
}

/**
 * POST /api/agent/respond
 *
 * The backend envelope carries memories_used, reasoning and raw_memories: internal
 * organizational data, including what other customers previously reported. None of
 * that is forwarded to this function, let alone to the browser. Only the reply
 * text and a count of how many prior experiences informed it cross the boundary.
 *
 * This is the customer's privacy boundary. `memoryCount` is deliberately a bare
 * number: the chat renders "informed by N previous support cases" and shows no
 * memory text, no document id, and no relevance score.
 */
async function askSupportAgent(
  customer: string,
  message: string,
  email: string,
): Promise<SupportReply> {
  const res = await request<{
    customer: string
    response: string
    memory_count?: number
  }>('/api/agent/respond', {
    method: 'POST',
    body: JSON.stringify({ customer, message, customer_email: email }),
  })
  return {
    customer: res.customer,
    response: res.response,
    memoryCount: typeof res.memory_count === 'number' ? res.memory_count : 0,
  }
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

  /* ---------------------------------------------------------------------
   * Admin control plane.
   *
   * There is deliberately no token argument on any of these. The session is an
   * HTTP-only cookie the browser attaches automatically, so admin credentials
   * never enter JavaScript and cannot be read from storage or from XSS.
   *
   * Hiding the dashboard in the UI is not what protects these endpoints; the
   * backend requires the session independently. A request from outside the
   * app receives 401.
   * ------------------------------------------------------------------ */

  admin: {
    login: (username: string, password: string) =>
      request<{ username: string; expires_in: number; token: string }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),

    /**
     * Confirm the current session. This is the request that decides whether the
     * dashboard renders or the app redirects to /admin/login.
     */
    me: () => request<AdminIdentity>('/api/admin/auth/me'),

    logout: () => request<{ ok: boolean }>('/api/admin/auth/logout', { method: 'POST' }),

    overview: () => request<AdminOverview>('/api/admin/overview'),

    system: () => request<AdminSystemInfo>('/api/admin/system'),

    listMemories: (params: { q?: string; state?: string; fact_type?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams()
      if (params.q) query.set('q', params.q)
      if (params.state) query.set('state', params.state)
      if (params.fact_type) query.set('type', params.fact_type)
      if (params.limit) query.set('limit', String(params.limit))
      if (params.offset) query.set('offset', String(params.offset))
      const suffix = query.toString() ? `?${query}` : ''
      return request<AdminMemoryListResponse>(`/api/admin/memories${suffix}`)
    },

    getMemory: (id: string) => request<AdminMemoryResponse>(`/api/admin/memories/${encodeURIComponent(id)}`),

    editMemory: (
      id: string,
      patch: { text?: string; context?: string | null; fact_type?: string; entities?: string[] },
    ) =>
      request<AdminMemoryResponse>(`/api/admin/memories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    /**
     * Retire a memory. This archives it in Hindsight (state="invalidated"), so
     * it stops being recalled. It is NOT a hard delete: Hindsight has no
     * per-memory delete, and the response says so.
     */
    retireMemory: (id: string, reason?: string) =>
      request<AdminMemoryResponse>(`/api/admin/memories/${encodeURIComponent(id)}/retire`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason ?? null }),
      }),

    restoreMemory: (id: string) =>
      request<AdminMemoryResponse>(`/api/admin/memories/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
      }),

    memoryStats: () => request<AdminMemoryStats>('/api/admin/memories/stats'),

    experiences: () =>
      request<{ bank_id: string; count: number; entries: TimelineEntry[] }>('/api/admin/experiences'),

    documents: () =>
      request<{ bank_id: string; documents: Record<string, unknown>[]; total: number }>(
        '/api/admin/documents',
      ),

    learning: (question?: string) =>
      request<LearnedResponse>(`/api/admin/learning${question ? `?question=${encodeURIComponent(question)}` : ''}`),

    learningTimeline: () =>
      request<{ bank_id: string; count: number; entries: TimelineEntry[] }>(
        '/api/admin/learning/timeline',
      ),

    recordOutcome: (input: { customer: string; lesson: string; scenario?: string }) => {
      const query = new URLSearchParams({ customer: input.customer, lesson: input.lesson })
      if (input.scenario) query.set('scenario', input.scenario)
      return request<{ retained: boolean; document_id: string; bank_id: string }>(
        `/api/admin/experiences/outcome?${query}`,
        { method: 'POST' },
      )
    },

    testimonials: () => request<AdminTestimonialListResponse>('/api/admin/testimonials'),

    moderateTestimonial: (
      id: string,
      action: 'approve' | 'reject' | 'unpublish' | 'delete',
    ) =>
      action === 'delete'
        ? request<AdminTestimonialActionResponse>(
            `/api/admin/testimonials/${encodeURIComponent(id)}`,
            { method: 'DELETE' },
          )
        : request<AdminTestimonialActionResponse>(
            `/api/admin/testimonials/${encodeURIComponent(id)}/${action}`,
            { method: 'POST' },
          ),
  },
}
