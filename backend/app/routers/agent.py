from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
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
    try:
        document_id, retained = await record_outcome(
            request.bank_id,
            request.customer,
            request.lesson,
            scenario=request.scenario,
            tags=request.tags,
        )
    except (HindsightError, GroqError) as exc:
        raise _fail(exc) from exc
    bank = request.bank_id or settings.HINDSIGHT_BANK_ID
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
async def agent_learned(request: LearnedRequest) -> LearnedResponse:
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
async def agent_timeline(bank_id: str | None = None) -> TimelineResponse:
    try:
        entries = await learning_timeline(bank_id=bank_id)
    except (HindsightError, GroqError) as exc:
        raise _fail(exc) from exc
    return TimelineResponse(
        entries=entries,
        count=len(entries),
        bank_id=bank_id or settings.HINDSIGHT_BANK_ID,
    )
