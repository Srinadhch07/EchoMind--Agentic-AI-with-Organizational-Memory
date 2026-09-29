from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    customer: str = Field(default="Customer", examples=["Customer B"])
    message: str = Field(..., examples=["We need to export 50,000 customer records."])
    bank_id: str | None = Field(default=None)
    tags: list[str] | None = Field(default=None)


class RecalledMemory(BaseModel):
    id: str
    text: str
    type: str | None = None
    context: str | None = None
    document_id: str | None = None
    metadata: dict[str, str] | None = None
    score: float | None = None


class AgentResponse(BaseModel):
    customer: str
    response: str
    memories_used: list[RecalledMemory] = []
    memory_count: int = 0
    reasoning: str | None = None
    bank_id: str
    retained: bool = False
    retained_document_id: str | None = None
    raw_memories: list[dict[str, Any]] = []


class OutcomeRequest(BaseModel):
    customer: str = Field(default="Customer", examples=["Customer A"])
    lesson: str = Field(
        ...,
        examples=[
            "The standard CSV export timed out. A background batched export with a "
            "secure download link worked."
        ],
    )
    scenario: str | None = None
    bank_id: str | None = None
    tags: list[str] | None = None


class OutcomeResponse(BaseModel):
    retained: bool
    document_id: str
    lesson: str
    bank_id: str


class LearnedRequest(BaseModel):
    question: str | None = None
    bank_id: str | None = None
    tags: list[str] | None = None


class LearnedResponse(BaseModel):
    summary: str
    memory_count: int
    memories: list[dict[str, Any]] = []


class TimelineEntry(BaseModel):
    id: str
    customer: str
    source: str
    occurred_at: str | None = None
    lessons: list[str] = []


class TimelineResponse(BaseModel):
    entries: list[TimelineEntry] = []
    count: int = 0
    bank_id: str
