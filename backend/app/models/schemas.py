from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    customer: str = Field(default="Customer", examples=["Customer B"])
    message: str = Field(..., examples=["We need to export 50,000 customer records."])
    # Support-session contact address. Used for support traceability only:
    # it is never written to Hindsight and never sent to the LLM.
    customer_email: str | None = Field(default=None, examples=["demo@example.com"])
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
    # Support-session contact address. Never persisted to organizational memory.
    customer_email: str | None = Field(default=None, examples=["demo@example.com"])
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


class TestimonialCreate(BaseModel):
    """A voluntarily submitted testimonial.

    `email` is optional and is never returned by any public endpoint. It exists
    only so a submission can be followed up with the person who sent it.
    """

    name: str = Field(..., min_length=2, max_length=80, examples=["Priya"])
    testimonial: str = Field(
        ...,
        min_length=40,
        max_length=1200,
        examples=[
            "Our support team kept rediscovering the same export fix. Having the "
            "lesson available made new agents useful much sooner."
        ],
    )
    role: str | None = Field(default=None, max_length=80, examples=["Support lead"])
    organization: str | None = Field(default=None, max_length=80, examples=["Acme"])
    email: str | None = Field(default=None, max_length=254, examples=["priya@example.com"])
    permission: bool = Field(
        ...,
        description="Must be true. Without public permission the submission is never displayed.",
    )


class TestimonialPublic(BaseModel):
    """Public shape. Contains no email address and no internal metadata."""

    id: str
    name: str
    role: str | None = None
    organization: str | None = None
    testimonial: str
    created_at: str
    is_sample: bool = False


class TestimonialCreated(BaseModel):
    """Acknowledgement after submission. Confirms nothing was published."""

    id: str
    status: str
    message: str


class TestimonialListResponse(BaseModel):
    testimonials: list[TestimonialPublic] = []
    count: int = 0
