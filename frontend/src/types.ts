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
  /**
   * How many previous support cases informed this reply.
   *
   * A number and nothing else. The memory texts, document ids and relevance
   * scores stay on the server, so the chat can say that prior experience was
   * used without ever showing another customer's case.
   */
  memoryCount: number
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
  /**
   * Agent reply only: the number of previous support cases that shaped it.
   * Used to render the "informed by our previous experience" note. Absent on
   * customer messages, which never draw on organizational memory.
   */
  memoryCount?: number
}

export type ResolutionChoice = 'resolved' | 'unresolved'

/* -------------------------------------------------------------------------
 * Admin control plane
 *
 * These types are only ever produced by endpoints that require an admin
 * session. The session itself is an HTTP-only cookie the browser sends
 * automatically: nothing here stores or reads a token, and there is no
 * `admin_token` in localStorage anywhere in this app.
 * ---------------------------------------------------------------------- */

export interface AdminIdentity {
  username: string
  expires_in: number
}

/** One Hindsight memory unit, projected to the fields Hindsight returns. */
export interface AdminMemory {
  id: string
  text: string
  context: string | null
  fact_type: string | null
  state: string
  document_id: string | null
  chunk_id: string | null
  entities: string[]
  tags: string[]
  metadata: Record<string, string>
  proof_count: number | null
  mentioned_at: string | null
  occurred_start: string | null
  occurred_end: string | null
  consolidated_at: string | null
  edited_at: string | null
  updated_at: string | null
  invalidation_reason: string | null
  invalidated_at: string | null
  /** False for derived 'observation' memories, which Hindsight will not curate. */
  curatable: boolean
}

export interface AdminMemoryListResponse {
  bank_id: string
  memories: AdminMemory[]
  total: number
  limit: number
  offset: number
  query: string | null
}

export interface AdminMemoryResponse {
  bank_id: string
  memory: AdminMemory
  retired?: boolean
  restored?: boolean
  note?: string | null
}

export interface AdminMemoryStats {
  bank_id: string
  exists: boolean
  total_memories: number | null
  total_documents: number | null
  total_observations: number | null
  pending_operations: number | null
  failed_operations: number | null
  last_memory_write_at: string | null
}

/**
 * Moderation view of a testimonial.
 *
 * Unlike `Testimonial` above, this one HAS an `email`, because an
 * administrator needs it to follow up with the person who submitted the entry.
 * The backend never returns this shape from a public endpoint.
 */
export interface AdminTestimonial {
  id: string
  name: string
  role: string | null
  organization: string | null
  email: string | null
  testimonial: string
  permission: boolean
  status: TestimonialStatus
  is_sample: boolean
  created_at: string
  reviewed_at: string | null
}

export type TestimonialStatus = 'pending' | 'approved' | 'rejected'

export interface AdminTestimonialListResponse {
  pending: AdminTestimonial[]
  approved: AdminTestimonial[]
  rejected: AdminTestimonial[]
  counts: Record<string, number>
}

export interface AdminTestimonialActionResponse {
  id: string
  status: string | null
  deleted: boolean
  message: string
}

export interface AdminOverview {
  bank_id: string
  bank_exists: boolean
  total_memories: number | null
  total_documents: number | null
  total_observations: number | null
  experiences: number | null
  outcomes: number | null
  customers: number | null
  pending_testimonials: number
  approved_testimonials: number
  rejected_testimonials: number
  last_memory_write_at: string | null
}

export interface AdminSystemInfo {
  app_name: string
  memory_bank: string
  hindsight_configured: boolean
  groq_configured: boolean
  admin_auth_configured: boolean
  testimonial_moderation_enabled: boolean
  session_minutes: number
  capabilities: Record<string, string>
}
