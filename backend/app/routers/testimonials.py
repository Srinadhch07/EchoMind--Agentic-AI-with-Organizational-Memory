from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.models.schemas import (
    TestimonialCreate,
    TestimonialCreated,
    TestimonialListResponse,
    TestimonialPublic,
)
from app.services import testimonials as store

logger = logging.getLogger("echomind.testimonials")

router = APIRouter()

SUBMITTED_MESSAGE = (
    "Thank you for sharing your experience. Your testimonial has been submitted "
    "for review. It will only appear on this page once it has been approved."
)


def _require_moderator(admin_key: str | None) -> None:
    """Approve/review routes require the configured moderation secret."""
    expected = settings.TESTIMONIAL_ADMIN_KEY
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Testimonial moderation is not enabled. Set "
                "TESTIMONIAL_ADMIN_KEY in the environment to review submissions."
            },
        )
    if not admin_key or not hmac.compare_digest(admin_key, expected):
        raise HTTPException(status_code=403, detail={"error": "Invalid moderation key."})


@router.get("/testimonials", response_model=TestimonialListResponse)
async def list_testimonials() -> TestimonialListResponse:
    """Public list. Returns approved, permission-given testimonials only.

    The query itself filters on status and permission, and the public column
    list does not include the email address, so there is no way for an
    unapproved or private submission to reach this response.
    """
    rows = store.list_public()
    return TestimonialListResponse(
        testimonials=[TestimonialPublic(**row) for row in rows],
        count=len(rows),
    )


@router.post("/testimonials", response_model=TestimonialCreated, status_code=201)
async def create_testimonial(request: TestimonialCreate) -> TestimonialCreated:
    """Accept a voluntary submission. Always stored as pending."""
    if not request.permission:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Please confirm permission to display this testimonial publicly."
            },
        )

    created = store.create_testimonial(
        name=request.name,
        testimonial=request.testimonial,
        role=request.role,
        organization=request.organization,
        email=request.email,
        permission=request.permission,
    )
    logger.info(
        "testimonial.submitted id=%s organization=%s email=%s",
        created["id"],
        request.organization or "-",
        request.email or "-",
    )
    return TestimonialCreated(
        id=created["id"],
        status=created["status"],
        message=SUBMITTED_MESSAGE,
    )


@router.get("/testimonials/pending")
async def list_pending(admin_key: str | None = Header(default=None, alias="X-Admin-Key")) -> dict:
    """Submissions awaiting review. Moderator only."""
    _require_moderator(admin_key)
    rows = store.list_pending()
    return {"pending": rows, "count": len(rows)}


@router.post("/testimonials/{testimonial_id}/approve")
async def approve_testimonial(
    testimonial_id: str, admin_key: str | None = Header(default=None, alias="X-Admin-Key")
) -> dict:
    """Approve a submission so it can be shown publicly. Moderator only.

    A submission without public permission is still never displayed, because the
    public query requires permission as well as approval.
    """
    _require_moderator(admin_key)
    if not store.approve(testimonial_id):
        raise HTTPException(
            status_code=404, detail={"error": "No testimonial with that id."}
        )
    logger.info("testimonial.approved id=%s", testimonial_id)
    return {"id": testimonial_id, "status": "approved"}
