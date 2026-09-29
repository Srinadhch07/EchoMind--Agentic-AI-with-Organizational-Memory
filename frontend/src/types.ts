export interface RecalledMemory {
  id: string
  text: string
  type: string | null
  context: string | null
  document_id: string | null
  metadata: Record<string, string> | null
  score: number | null
}

export interface AgentResponse {
  customer: string
  response: string
  memories_used: RecalledMemory[]
  memory_count: number
  reasoning: string | null
  bank_id: string
  retained: boolean
  retained_document_id: string | null
  raw_memories: Record<string, unknown>[]
}

export interface OutcomeResponse {
  retained: boolean
  document_id: string
  lesson: string
  bank_id: string
}

export interface LearnedResponse {
  summary: string
  memory_count: number
  memories: Record<string, unknown>[]
}

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
