"""Admin API for the organizational memory control plane.

Every route except `POST /auth/login` depends on `get_current_admin`. That
dependency is the whole authorisation boundary: there is no per-route credential
logic, and no route here can be reached by skipping the frontend. An
unauthenticated DELETE to /api/admin/memories/{id} gets a 401 from this
dependency, exactly like any other protected endpoint.

Routes
------
  POST   /api/admin/auth/login                 issue a session (unauthenticated)
  GET    /api/admin/auth/me                    confirm the current session
  POST   /api/admin/auth/logout                clear the session cookie

  GET    /api/admin/overview                   real counts for the dashboard
  GET    /api/admin/system                     configuration + capability facts

  GET    /api/admin/memories                   list / search organizational memory
  GET    /api/admin/memories/{id}              inspect one memory
  GET    /api/admin/memories/{id}/history      revision history
  PATCH  /api/admin/memories/{id}              correct text / context / type
  POST   /api/admin/memories/{id}/retire       archive it (Hindsight invalidation)
  POST   /api/admin/memories/{id}/restore      return it to active recall
  GET    /api/admin/memories/stats             counts straight from Hindsight

  GET    /api/admin/experiences                grouped support experiences
  GET    /api/admin/documents                  source documents behind memories

  GET    /api/admin/learning                   summarised organizational learning
  POST   /api/admin/learning                   re-summarise
  POST   /api/admin/experiences/outcome        record a case outcome as memory

  GET    /api/admin/testimonials               full moderation queue
  POST   /api/admin/testimonials/{id}/approve
  POST   /api/admin/testimonials/{id}/reject
  POST   /api/admin/testimonials/{id}/unpublish
  DELETE /api/admin/testimonials/{id}
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Query, Response

from app.config import settings
from app.dependencies import CurrentAdmin
from app.models.schemas import (
    AdminIdentity,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMemoryEdit,
    AdminMemoryListResponse,
    AdminMemoryResponse,
    AdminMemoryStats,
    AdminOverview,
    AdminOutcomeRequest,
    AdminRetireRequest,
    AdminSystemInfo,
    AdminTestimonial,
    AdminTestimonialActionResponse,
    AdminTestimonialListResponse,
)
from app.services import memory_admin, testimonials as testimonial_store
from app.services.admin_auth import (
    COOKIE_NAME,
    AdminAuthDisabled,
    AdminAuthError,
    authenticate,
    is_configured,
)
from app.services.agent import learning_timeline, record_outcome, summarize_learning
from app.services.groq_client import GroqError
from app.services.hindsight import HindsightError

logger = logging.getLogger("echomind.admin")

router = APIRouter()

INVALID_CREDENTIALS = "Incorrect username or password."

# Reported verbatim on the settings screen so the limitation is discoverable in
# the product, not only in the source.
CAPABILITIES = {
    "list_memories": "supported",
    "search_memories": "supported (Hindsight server-side search)",
    "inspect_memory": "supported",
    "edit_memory": "supported (Hindsight curate: text, context, type, entities)",
    "retire_memory": "supported (Hindsight soft-retire, reversible)",
    "restore_memory": "supported",
    "delete_single_memory": (
        "not supported by Hindsight - there is no per-memory delete endpoint. "
        "Retiring archives a memory so it stops being recalled."
    ),
    "clear_whole_bank": (
        "Hindsight can delete every memory in a bank, but not a selection. It is "
        "not exposed here because it would destroy the whole organization's memory."
    ),
    "edit_observations": "not supported - Hindsight derives observations and will not curate them",
}


def _upstream_error(exc: Exception) -> HTTPException:
    """Hindsight / Groq failures are 502, never disguised as validation errors."""
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
    if isinstance(exc, memory_admin.MemoryAdminError):
        return HTTPException(status_code=exc.status_code, detail={"error": exc.message})
    raise exc


def _set_session_cookie(response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        # HTTP-only: page JavaScript cannot read the session, so an XSS payload
        # cannot exfiltrate it.
        httponly=True,
        # Lax still sends the cookie on top-level navigation and blocks the
        # cross-site form posts that CSRF relies on.
        samesite="lax",
        secure=settings.ADMIN_COOKIE_SECURE,
        path="/",
    )


# ------------------------------------------------------------------- auth


@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest, response: Response) -> AdminLoginResponse:
    """Exchange credentials for a signed session.

    An unknown username and a wrong password produce the same 401 with the same
    message, so this cannot be used to discover which usernames exist.
    """
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Admin access is not configured. Set ADMIN_USERNAME, "
                "ADMIN_SECRET_KEY and either ADMIN_PASSWORD_HASH or "
                "ADMIN_PASSWORD in the backend environment."
            },
        )
    try:
        session = authenticate(payload.username, payload.password)
    except AdminAuthDisabled as exc:
        raise HTTPException(status_code=503, detail={"error": str(exc)}) from exc
    except AdminAuthError as exc:
        raise HTTPException(status_code=401, detail={"error": str(exc)}) from exc

    _set_session_cookie(response, session["token"], session["expires_in"])
    return AdminLoginResponse(
        username=session["username"],
        expires_in=session["expires_in"],
        token=session["token"],
    )


@router.get("/auth/me", response_model=AdminIdentity)
async def admin_me(_admin: CurrentAdmin) -> AdminIdentity:
    """Confirm the session.

    The frontend calls this on every visit to /organization. A redirect in
    response to a 401 here is what actually gates the dashboard.

    `expires_in` is the real remaining lifetime of the presented token, read from
    the `exp` claim the dependency already validated, not the configured session
    length. Reporting the configured length would claim eight hours of validity
    for a token that expires in four minutes.
    """
    expires_at = _admin.get("exp")
    remaining = int(expires_at) - int(time.time()) if isinstance(expires_at, int) else 0
    return AdminIdentity(
        username=str(_admin.get("sub") or settings.ADMIN_USERNAME),
        expires_in=max(0, remaining),
    )


@router.post("/auth/logout")
async def admin_logout(_admin: CurrentAdmin, response: Response) -> dict:
    """Clear the session cookie.

    Authenticated like every other admin route, so logout cannot be used as an
    unauthenticated probe of the auth configuration.

    The token is stateless, so this is a client-side sign-out: the cookie is
    removed. A token captured before logout stays valid until it expires, which
    is the accepted trade-off for a stateless session in a prototype. Shorten
    ADMIN_SESSION_MINUTES to narrow the window.
    """
    response.delete_cookie(key=COOKIE_NAME, path="/")
    logger.info("admin.logout user=%s", _admin.get("username", "-"))
    return {"ok": True}


# ---------------------------------------------------------------- overview


@router.get("/overview", response_model=AdminOverview)
async def admin_overview(_admin: CurrentAdmin) -> AdminOverview:
    """Dashboard counts. Every number is measured, never assumed.

    Memory figures come from Hindsight's stats endpoint and experience figures
    from the real learning timeline. When either source fails the overview still
    succeeds, with that field left as null rather than showing a fabricated 0.
    """
    bank = settings.HINDSIGHT_BANK_ID

    stats: dict = {}
    try:
        stats = await memory_admin.memory_stats(bank_id=bank)
    except HindsightError as exc:
        logger.warning("admin.overview stats unavailable: %s", exc.message)

    experiences = outcomes = customers = None
    try:
        entries = await learning_timeline(bank_id=bank, limit=200)
        experiences = len(entries)
        outcomes = sum(
            1 for e in entries if e["source"] == "echomind-outcome" or e["id"].startswith("outcome-")
        )
        customers = len({e["customer"] for e in entries if e["customer"]})
    except HindsightError as exc:
        logger.warning("admin.overview timeline unavailable: %s", exc.message)

    counts = testimonial_store.counts()
    return AdminOverview(
        bank_id=bank,
        bank_exists=bool(stats.get("exists")),
        total_memories=stats.get("total_memories"),
        total_documents=stats.get("total_documents"),
        total_observations=stats.get("total_observations"),
        experiences=experiences,
        outcomes=outcomes,
        customers=customers,
        pending_testimonials=counts.get("pending", 0),
        approved_testimonials=counts.get("approved", 0),
        rejected_testimonials=counts.get("rejected", 0),
        last_memory_write_at=stats.get("last_memory_write_at"),
    )


@router.get("/system", response_model=AdminSystemInfo)
async def admin_system(_admin: CurrentAdmin) -> AdminSystemInfo:
    """Configuration facts and capability flags. No secret values are returned."""
    return AdminSystemInfo(
        app_name=settings.APP_NAME,
        memory_bank=settings.HINDSIGHT_BANK_ID,
        hindsight_configured=bool(settings.HINDSIGHT_API_KEY),
        groq_configured=bool(settings.GROQ_API_KEY),
        admin_auth_configured=is_configured(),
        # True when a HASHED password is configured; the plaintext fallback still
        # works but is worth surfacing.
        testimonial_moderation_enabled=bool(settings.TESTIMONIAL_ADMIN_KEY),
        session_minutes=settings.ADMIN_SESSION_MINUTES,
        capabilities=CAPABILITIES,
    )


# ----------------------------------------------------------------- memories


@router.get("/memories", response_model=AdminMemoryListResponse)
async def admin_list_memories(
    _admin: CurrentAdmin,
    q: str | None = Query(default=None, max_length=200),
    state: str | None = Query(default=None, pattern="^(valid|invalidated)$"),
    fact_type: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminMemoryListResponse:
    """List or search organizational memory.

    An empty bank returns 200 with an empty list, because "nothing learned yet"
    is a correct answer rather than a failure.
    """
    try:
        result = await memory_admin.list_memories(
            query=q, state=state, fact_type=fact_type, limit=limit, offset=offset
        )
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc
    return AdminMemoryListResponse(**result)


@router.get("/memories/stats", response_model=AdminMemoryStats)
async def admin_memory_stats(_admin: CurrentAdmin) -> AdminMemoryStats:
    try:
        return AdminMemoryStats(**await memory_admin.memory_stats())
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc


@router.get("/memories/{memory_id}", response_model=AdminMemoryResponse)
async def admin_get_memory(memory_id: str, _admin: CurrentAdmin) -> AdminMemoryResponse:
    try:
        result = await memory_admin.get_memory(memory_id)
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc
    return AdminMemoryResponse(**result)


@router.get("/memories/{memory_id}/history")
async def admin_memory_history(memory_id: str, _admin: CurrentAdmin) -> dict:
    try:
        return await memory_admin.memory_history(memory_id)
    except HindsightError as exc:
        raise _upstream_error(exc) from exc


@router.patch("/memories/{memory_id}", response_model=AdminMemoryResponse)
async def admin_edit_memory(
    memory_id: str, payload: AdminMemoryEdit, _admin: CurrentAdmin
) -> AdminMemoryResponse:
    """Correct a memory. A real Hindsight curate, not a local annotation.

    Updating the text re-embeds the memory and drops its derived observations, so
    the correction is what future recall will use.
    """
    try:
        result = await memory_admin.edit_memory(
            memory_id,
            text=payload.text,
            context=payload.context,
            fact_type=payload.fact_type,
            entities=payload.entities,
        )
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc
    return AdminMemoryResponse(**result)


@router.post("/memories/{memory_id}/retire", response_model=AdminMemoryResponse)
async def admin_retire_memory(
    memory_id: str, payload: AdminRetireRequest, _admin: CurrentAdmin
) -> AdminMemoryResponse:
    """Retire a memory so EchoMind stops using it.

    Not a hard delete: Hindsight has no per-memory delete. This archives the
    memory (excluded from recall and consolidation) and is reversible. The
    response says so explicitly.
    """
    try:
        result = await memory_admin.retire_memory(memory_id, reason=payload.reason)
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc
    return AdminMemoryResponse(**result)


@router.post("/memories/{memory_id}/restore", response_model=AdminMemoryResponse)
async def admin_restore_memory(memory_id: str, _admin: CurrentAdmin) -> AdminMemoryResponse:
    """Return a retired memory to active recall."""
    try:
        result = await memory_admin.restore_memory(memory_id)
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc
    return AdminMemoryResponse(**result)


# ------------------------------------------------------------- experiences


@router.get("/experiences")
async def admin_experiences(_admin: CurrentAdmin, limit: int = Query(default=50, ge=1, le=200)) -> dict:
    """Grouped support experiences, an admin view of the existing timeline.

    These are the retained experience DOCUMENTS. Each is not one Hindsight memory:
    a single document is decomposed into several atomic memory units, and the
    memory id is listed alongside it so the relationship is explicit.
    """
    try:
        entries = await learning_timeline(limit=limit)
    except (HindsightError, GroqError) as exc:
        raise _upstream_error(exc) from exc

    return {
        "bank_id": settings.HINDSIGHT_BANK_ID,
        "count": len(entries),
        "entries": entries,
    }


@router.get("/documents")
async def admin_documents(_admin: CurrentAdmin, limit: int = Query(default=25, ge=1, le=200)) -> dict:
    """Source documents behind the memories."""
    try:
        return await memory_admin.list_documents(limit=limit)
    except (HindsightError, memory_admin.MemoryAdminError) as exc:
        raise _upstream_error(exc) from exc


@router.post("/experiences/outcome")
async def admin_record_outcome(
    _admin: CurrentAdmin,
    payload: AdminOutcomeRequest,
) -> dict:
    """Record how a case actually went, making it organizational memory.

    Same code path the organization view already used, now behind admin auth and
    taking the case details in a request body rather than the query string.
    """
    try:
        document_id, retained = await record_outcome(
            None, payload.customer.strip() or "Customer", payload.lesson.strip(), scenario=payload.scenario
        )
    except (HindsightError, GroqError) as exc:
        raise _upstream_error(exc) from exc
    logger.info("admin.outcome document=%s retained=%s", document_id, retained)
    return {"retained": retained, "document_id": document_id, "bank_id": settings.HINDSIGHT_BANK_ID}


# ---------------------------------------------------------------- learning


@router.get("/learning")
@router.post("/learning")
async def admin_learning(_admin: CurrentAdmin, question: str | None = Query(default=None, max_length=300)) -> dict:
    """Summarised organizational learning, exactly as the agent generates it.

    Reuses summarize_learning so the admin view and the support view can never
    disagree about what the organization has learned.
    """
    try:
        result = await summarize_learning(question=question)
    except (HindsightError, GroqError) as exc:
        raise _upstream_error(exc) from exc
    return result


@router.get("/learning/timeline")
async def admin_learning_timeline(_admin: CurrentAdmin, limit: int = Query(default=50, ge=1, le=200)) -> dict:
    try:
        entries = await learning_timeline(limit=limit)
    except (HindsightError, GroqError) as exc:
        raise _upstream_error(exc) from exc
    return {
        "bank_id": settings.HINDSIGHT_BANK_ID,
        "count": len(entries),
        "entries": entries,
    }


# ------------------------------------------------------------ testimonials


@router.get("/testimonials", response_model=AdminTestimonialListResponse)
async def admin_testimonials(_admin: CurrentAdmin) -> AdminTestimonialListResponse:
    """The full moderation queue, grouped by status.

    This is the only place a submitter's email address is returned. The public
    endpoint uses TestimonialPublic, which has no email field at all.
    """
    rows = testimonial_store.list_by_status()
    grouped: dict[str, list[AdminTestimonial]] = {
        "pending": [],
        "approved": [],
        "rejected": [],
    }
    for row in rows:
        record = AdminTestimonial(**row)
        grouped.setdefault(record.status, []).append(record)
    return AdminTestimonialListResponse(
        pending=grouped["pending"],
        approved=grouped["approved"],
        rejected=grouped["rejected"],
        counts=testimonial_store.counts(),
    )


def _testimonial_action(testimonial_id: str, action, *, deleted: bool = False) -> AdminTestimonialActionResponse:
    if not action(testimonial_id):
        raise HTTPException(status_code=404, detail={"error": "No testimonial with that id."})
    if deleted:
        logger.info("admin.testimonial.deleted id=%s", testimonial_id)
        return AdminTestimonialActionResponse(
            id=testimonial_id, deleted=True, message="Testimonial deleted permanently."
        )
    new_status = testimonial_store.get_status(testimonial_id)
    logger.info("admin.testimonial.status id=%s status=%s", testimonial_id, new_status)
    return AdminTestimonialActionResponse(
        id=testimonial_id,
        status=new_status,
        message=f"Testimonial is now {new_status}.",
    )


@router.post("/testimonials/{testimonial_id}/approve")
async def admin_approve_testimonial(
    testimonial_id: str, _admin: CurrentAdmin
) -> AdminTestimonialActionResponse:
    return _testimonial_action(testimonial_id, testimonial_store.approve)


@router.post("/testimonials/{testimonial_id}/reject")
async def admin_reject_testimonial(
    testimonial_id: str, _admin: CurrentAdmin
) -> AdminTestimonialActionResponse:
    return _testimonial_action(testimonial_id, testimonial_store.reject)


@router.post("/testimonials/{testimonial_id}/unpublish")
async def admin_unpublish_testimonial(
    testimonial_id: str, _admin: CurrentAdmin
) -> AdminTestimonialActionResponse:
    return _testimonial_action(testimonial_id, testimonial_store.unpublish)


@router.delete("/testimonials/{testimonial_id}")
async def admin_delete_testimonial(
    testimonial_id: str, _admin: CurrentAdmin
) -> AdminTestimonialActionResponse:
    return _testimonial_action(testimonial_id, testimonial_store.delete, deleted=True)
