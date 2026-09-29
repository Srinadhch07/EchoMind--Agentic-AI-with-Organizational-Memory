/**
 * Frontend types.
 *
 * These mirror the FastAPI schemas in backend/app/models/schemas.py, with one
 * deliberate difference: the customer-facing support types contain only what a
 * customer is allowed to see. The richer agent envelope (memories_used, reasoning,
 * raw_memories) is intentionally NOT represented here, so the customer UI cannot
 * accidentally render internal memory metadata or the model's internal reasoning.
 */

/** Customer-safe projection of POST /api/agent/respond. */
export interface SupportReply {
  customer: string
  response: string
}

/** POST /api/agent/outcome */
export interface OutcomeResponse {
  retained: boolean
  document_id: string
  lesson: string
  bank_id: string
}

/** POST /api/agent/learned — internal / organization surface only. */
export interface LearnedResponse {
  summary: string
  memory_count: number
  memories: Record<string, unknown>[]
}

/** GET /api/agent/timeline — internal / organization surface only. */
export interface TimelineEntry {
  id: string
  customer: string
  source: string
  occurred_at: string | null
  lessons: string[]
}

export interface TimelineResponse {
  entries: TimelineEntry[]
  count: number
  bank_id: string
}

/** GET /api/health */
export interface HealthResponse {
  status: string
  app: string
  groq_configured: boolean
  hindsight_configured: boolean
}

/**
 * A publicly displayed testimonial.
 *
 * There is deliberately no `email` and no moderation metadata on this type. The
 * backend does not return them either, so contact details cannot reach the page
 * even if a future change tried to add them here.
 */
export interface Testimonial {
  id: string
  name: string
  role: string | null
  organization: string | null
  testimonial: string
  created_at: string
  /** True for the clearly-labelled sample content, never a real customer. */
  is_sample: boolean
}

export interface TestimonialListResponse {
  testimonials: Testimonial[]
  count: number
}

export interface TestimonialCreatedResponse {
  id: string
  status: string
  message: string
}

/** A single turn in the customer support conversation. */
export interface SupportMessage {
  id: string
  role: 'customer' | 'agent'
  text: string
  at: number
  /** Agent reply still in flight. */
  pending?: boolean
  /** Agent reply that failed; the message body holds the error text. */
  failed?: boolean
  /** Customer's resolution answer for the agent reply above it. */
  resolution?: ResolutionChoice | null
}

export type ResolutionChoice = 'resolved' | 'unresolved'
