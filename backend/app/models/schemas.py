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
    """A support outcome submitted by a customer, so this is a PUBLIC write.

    Every field is length-bounded on purpose. Once this route is reachable
    without a session, an unbounded free-text field would let anyone store
    arbitrarily large blobs in organizational memory, and would be the cheapest
    possible way to pollute what the agent later recalls. The bounds mirror
    AdminOutcomeRequest so the public and administrative write paths cannot
    drift apart.
    """

    customer: str = Field(
        default="Customer", min_length=1, max_length=120, examples=["Customer A"]
    )
    lesson: str = Field(
        ...,
        min_length=10,
        max_length=4000,
        examples=[
            "The standard CSV export timed out. A background batched export with a "
            "secure download link worked."
        ],
    )
    scenario: str | None = Field(default=None, max_length=200)
    # Support-session contact address. Never persisted to organizational memory.
    customer_email: str | None = Field(default=None, max_length=320, examples=["demo@example.com"])
    # Accepted for wire compatibility, but ignored by the public route: a
    # caller-chosen bank would be a cross-bank write on an unauthenticated
    # endpoint. The route always uses settings.HINDSIGHT_BANK_ID.
    bank_id: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = Field(default=None, max_length=8)


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


# ---------------------------------------------------------------------------
# Admin control plane
#
# These shapes are only ever returned by routes that depend on
# `get_current_admin`. The admin testimonial view is the one place a submitter's
# email address is exposed, and it exists so a moderator can follow up; the
# public models above have no such field.
# ---------------------------------------------------------------------------


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=1, max_length=200)


class AdminIdentity(BaseModel):
    """Who is signed in, and for how much longer. Never contains secrets."""

    username: str
    expires_in: int


class AdminLoginResponse(BaseModel):
    """The token is also set as an HTTP-only cookie; this body is for API clients."""

    username: str
    expires_in: int
    token: str


class AdminMemory(BaseModel):
    """A single Hindsight memory unit, projected to the fields Hindsight returns."""

    id: str
    text: str
    context: str | None = None
    fact_type: str | None = None
    state: str = "valid"
    document_id: str | None = None
    chunk_id: str | None = None
    entities: list[str] = []
    tags: list[str] = []
    metadata: dict[str, str] = {}
    proof_count: int | None = None
    mentioned_at: str | None = None
    occurred_start: str | None = None
    occurred_end: str | None = None
    consolidated_at: str | None = None
    edited_at: str | None = None
    updated_at: str | None = None
    invalidation_reason: str | None = None
    invalidated_at: str | None = None
    # False for derived 'observation' memories, which Hindsight will not curate.
    curatable: bool = True


class AdminMemoryListResponse(BaseModel):
    bank_id: str
    memories: list[AdminMemory] = []
    total: int = 0
    limit: int = 25
    offset: int = 0
    query: str | None = None


class AdminMemoryResponse(BaseModel):
    bank_id: str
    memory: AdminMemory
    retired: bool = False
    restored: bool = False
    note: str | None = None


class AdminMemoryEdit(BaseModel):
    text: str | None = Field(default=None, max_length=4000)
    context: str | None = Field(default=None, max_length=2000)
    fact_type: str | None = Field(default=None)
    entities: list[str] | None = None


class AdminRetireRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class AdminOutcomeRequest(BaseModel):
    """A case outcome, sent as a body rather than query parameters.

    Query parameters end up in access logs and proxy logs. A customer's details
    and the lesson text do not belong in a URL, so this is a POST body.
    """

    customer: str = Field(min_length=1, max_length=120)
    lesson: str = Field(min_length=10, max_length=4000)
    scenario: str | None = Field(default=None, max_length=200)


class AdminMemoryStats(BaseModel):
    bank_id: str
    exists: bool
    total_memories: int | None = None
    total_documents: int | None = None
    total_observations: int | None = None
    pending_operations: int | None = None
    failed_operations: int | None = None
    last_memory_write_at: str | None = None


class AdminTestimonial(BaseModel):
    """Moderation view. Includes the contact address so an admin can follow up.

    This model is never used by the public endpoints.
    """

    id: str
    name: str
    role: str | None = None
    organization: str | None = None
    email: str | None = None
    testimonial: str
    permission: bool
    status: str
    is_sample: bool = False
    created_at: str
    reviewed_at: str | None = None


class AdminTestimonialListResponse(BaseModel):
    pending: list[AdminTestimonial] = []
    approved: list[AdminTestimonial] = []
    rejected: list[AdminTestimonial] = []
    counts: dict[str, int] = {}


class AdminTestimonialActionResponse(BaseModel):
    id: str
    status: str | None = None
    deleted: bool = False
    message: str


class AdminOverview(BaseModel):
    """Real counts only. Anything the backend cannot measure is simply absent."""

    bank_id: str
    bank_exists: bool
    total_memories: int | None = None
    total_documents: int | None = None
    total_observations: int | None = None
    experiences: int | None = None
    outcomes: int | None = None
    customers: int | None = None
    pending_testimonials: int
    approved_testimonials: int
    rejected_testimonials: int
    last_memory_write_at: str | None = None


class AdminSystemInfo(BaseModel):
    """Configuration facts an admin needs. Contains no secret values."""

    app_name: str
    memory_bank: str
    hindsight_configured: bool
    groq_configured: bool
    admin_auth_configured: bool
    testimonial_moderation_enabled: bool
    session_minutes: int
    capabilities: dict[str, str]
