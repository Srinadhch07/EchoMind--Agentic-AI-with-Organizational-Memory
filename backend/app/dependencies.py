"""Reusable FastAPI dependencies.

`get_current_admin` is the ONLY place EchoMind decides whether a request is an
authenticated administrator. Admin routes declare it and nothing else: there is
no per-endpoint credential check to forget or get wrong.

The frontend hides the dashboard behind a redirect, but that is presentation
only. This dependency is what actually enforces the boundary, which is why
hiding a button is never treated as access control anywhere in the admin code.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException

from app.services.admin_auth import (
    AdminAuthDisabled,
    AdminAuthError,
    decode_token,
    is_configured,
)


def get_current_admin(
    admin_cookie: Annotated[str | None, Cookie(alias="echomind_admin")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Authenticate an administrative request, or raise.

    Accepts the session token from either the HTTP-only cookie set at login or
    an `Authorization: Bearer` header, which is what API clients and the test
    suite use. Both are validated by the same code path.

    Raises:
        503: admin access is not configured (missing env values). This is
            deliberately not 401, because "no admin exists" and "you are not
            logged in" are different problems and the UI should say so.
        401: no token, a malformed token, a bad signature, a wrong subject, or
            an expired token.
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

    token = admin_cookie
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    try:
        return decode_token(token or "")
    except AdminAuthError as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": str(exc)},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except AdminAuthDisabled as exc:  # pragma: no cover - guarded above
        raise HTTPException(status_code=503, detail={"error": str(exc)}) from exc


CurrentAdmin = Annotated[dict, Depends(get_current_admin)]
