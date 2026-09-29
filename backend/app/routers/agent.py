from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.dependencies import CurrentAdmin
from app.models.schemas import (
    AgentRequest,
    AgentResponse,
    LearnedRequest,
    LearnedResponse,
    OutcomeRequest,
    OutcomeResponse,
    TimelineResponse,
)
from app.services.agent import learning_timeline, record_outcome, respond, summarize_learning
from app.services.groq_client import GroqError
from app.services.hindsight import HindsightError

logger = logging.getLogger("echomind.support")

router = APIRouter()

"""
Two of these four routes are the customer support product, and two are the
organization's internal view of memory.

/respond and /outcome are public, because a customer has to be able to do both:
ask a question, and then say whether the answer actually helped. /outcome is
where the lesson comes from, and a support agent that cannot record a
resolution cannot learn from one. It writes only the caller's own lesson and
returns nothing about anyone else's cases, so it exposes no organizational
data. Its input is length-bounded in OutcomeRequest for the same reason
/learned was left private: an unbounded public write is not a safe public write.

/learned and /timeline used to be public too. They summarise and enumerate
*every* retained case, so they now require the admin session. Leaving them open
meant the admin boundary was only as strong as the frontend route guard - anyone
who skipped the UI could still read the organization's memory.
"""


def _fail(exc: Exception) -> HTTPException:
    if isinstance(exc, HindsightError):
        return HTTPException(
            status_code=502,
            detail={
                "error": exc.message,
                "hindsight_status": exc.status_code,
                "hindsight_response": exc.detail,
            },
        )
    if isinstance(exc, GroqError):
        return HTTPException(status_code=502, detail={"error": exc.message})
    raise exc


@router.post("/respond", response_model=AgentResponse)
async def agent_respond(request: AgentRequest) -> AgentResponse:
    try:
        result = await respond(
            request.customer,
            request.message,
            bank_id=request.bank_id,
            tags=request.tags,
        )
    except (HindsightError, GroqError) as exc:
        raise _fail(exc) from exc
    # Support traceability only. The address is never written to Hindsight and
    # never reaches the LLM, so it cannot surface in organizational memory.
    logger.info(
        "support.interaction customer=%s email=%s bank=%s recalled=%d used=%d retained=%s",
        result.customer,
        request.customer_email or "-",
        result.bank_id,
        result.memory_count,
        len(result.memories_used),
        result.retained,
    )
    return result


@router.post("/outcome", response_model=OutcomeResponse)
async def agent_outcome(request: OutcomeRequest) -> OutcomeResponse:
    """Record how a support case actually went, as the customer reported it.

    Deliberately not admin-authenticated: this is the second half of the customer
    conversation, submitted from the public chat. It used to require an admin
    session, which meant every customer's feedback was rejected with 401 before
    it reached this function and no outcome was ever recorded from the product
    itself.

    What that makes public is a write of the caller's own lesson, bounded in
    length by OutcomeRequest. It reads no organizational memory and returns
    none. /learned and /timeline, which do expose every retained case, stay
    behind the admin session.

    The bank is always the configured one. Accepting a caller-supplied bank_id
    here would be a cross-bank write primitive on an unauthenticated route, so
    the field is ignored rather than trusted.
    """
    try:
        document_id, retained = await record_outcome(
            None,
            request.customer,
            request.lesson,
            scenario=request.scenario,
            tags=request.tags,
        )
    except (HindsightError, GroqError) as exc:
        logger.exception("support.outcome failed customer=%s", request.customer)
        raise _fail(exc) from exc
    bank = settings.HINDSIGHT_BANK_ID
    logger.info(
        "support.outcome customer=%s email=%s bank=%s document=%s retained=%s",
        request.customer,
        request.customer_email or "-",
        bank,
        document_id,
        retained,
    )
    return OutcomeResponse(
        retained=retained,
        document_id=document_id,
        lesson=request.lesson,
        bank_id=bank,
    )


@router.post("/learned", response_model=LearnedResponse)
async def agent_learned(request: LearnedRequest, _admin: CurrentAdmin) -> LearnedResponse:
    try:
        result = await summarize_learning(
            bank_id=request.bank_id,
            question=request.question,
            tags=request.tags,
        )
    except (HindsightError, GroqError) as exc:
        raise _fail(exc) from exc
    return LearnedResponse(**result)


@router.get("/timeline", response_model=TimelineResponse)
async def agent_timeline(_admin: CurrentAdmin, bank_id: str | None = None) -> TimelineResponse:
    try:
        entries = await learning_timeline(bank_id=bank_id)
    except (HindsightError, GroqError) as exc:
        raise _fail(exc) from exc
    return TimelineResponse(
        entries=entries,
        count=len(entries),
        bank_id=bank_id or settings.HINDSIGHT_BANK_ID,
    )
