import type {
  AgentResponse,
  LearnedResponse,
  OutcomeResponse,
  TimelineResponse,
} from './types'

const BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/+$/, '')

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

export const api = {
  health: () => request<{ status: string }>('/api/health'),

  respond: (customer: string, message: string) =>
    request<AgentResponse>('/api/agent/respond', {
      method: 'POST',
      body: JSON.stringify({ customer, message }),
    }),

  recordOutcome: (customer: string, lesson: string) =>
    request<OutcomeResponse>('/api/agent/outcome', {
      method: 'POST',
      body: JSON.stringify({
        customer,
        lesson,
        scenario: 'Customer support case outcome',
      }),
    }),

  learned: (question?: string) =>
    request<LearnedResponse>('/api/agent/learned', {
      method: 'POST',
      body: JSON.stringify({ question: question ?? null }),
    }),

  timeline: () => request<TimelineResponse>('/api/agent/timeline'),
}
