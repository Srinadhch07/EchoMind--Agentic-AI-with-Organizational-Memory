"""Admin authentication for the organizational memory control plane.

Deliberately standard-library only. EchoMind has five pinned dependencies
(FastAPI, uvicorn, groq, pydantic-settings, httpx) and none of them is an auth
library, so this module implements the small amount of cryptography that a
single-admin prototype needs using `hmac` and `hashlib`.

What this is
------------
* A real HS256 JSON Web Token, issued after a successful login and validated on
  every protected request. Signature is `HMAC-SHA256(ADMIN_SECRET_KEY, ...)`.
* The token carries an expiry (`exp`). An expired token is rejected.
* The token is delivered in an HTTP-only cookie, so page JavaScript cannot read
  it. A stolen XSS payload therefore cannot exfiltrate the session. The same
  token is also accepted as `Authorization: Bearer <token>` for API clients and
  tests.

How the password is checked
---------------------------
Two supported forms, in priority order:

1. `ADMIN_PASSWORD_HASH` -- PBKDF2-HMAC-SHA256, encoded as
   `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>`. Preferred, because only
   the hash is stored. Generate with the helper at the bottom of this file.
2. `ADMIN_PASSWORD` -- compared in constant time. Convenient for a hackathon;
   it means the plaintext sits in the environment file.

Only one of them needs to be set. There is no default password, no account
table, and no user-enumeration path: an unknown username and a wrong password
are indistinguishable to the caller because both run the same comparison and
return the same error.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any

from app.config import settings

logger = logging.getLogger("echomind.admin_auth")

COOKIE_NAME = "echomind_admin"

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_DEFAULT_ITERATIONS = 240_000


class AdminAuthError(Exception):
    """Authentication failed. The message is intentionally non-specific."""


class AdminAuthDisabled(Exception):
    """Admin access has not been configured, so it cannot be granted."""


# --------------------------------------------------------------------- helpers


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def is_configured() -> bool:
    """True when a username, a secret key and a password source are all present."""
    return bool(
        settings.ADMIN_USERNAME
        and settings.ADMIN_SECRET_KEY
        and (settings.ADMIN_PASSWORD_HASH or settings.ADMIN_PASSWORD)
    )


def require_configured() -> None:
    if not is_configured():
        raise AdminAuthDisabled(
            "Admin access is not configured. Set ADMIN_USERNAME, ADMIN_SECRET_KEY "
            "and either ADMIN_PASSWORD_HASH or ADMIN_PASSWORD in the environment."
        )


# ------------------------------------------------------------------- password


def hash_password(
    password: str,
    *,
    salt: bytes | None = None,
    iterations: int = PBKDF2_DEFAULT_ITERATIONS,
) -> str:
    """Build the encoded PBKDF2 hash stored in ADMIN_PASSWORD_HASH."""
    if salt is None:
        salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{PBKDF2_ALGORITHM}${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str) -> bool:
    """Constant-time check against whichever password source is configured.

    With ADMIN_PASSWORD_HASH set this runs a full PBKDF2 derivation and compares
    the results with `hmac.compare_digest`. With only ADMIN_PASSWORD set, the
    plaintext is hashed first so the comparison cost does not depend on the
    length of the secret, and does not depend on which of the two forms was
    configured.
    """
    encoded = settings.ADMIN_PASSWORD_HASH
    if encoded:
        try:
            algorithm, iterations_raw, salt_hex, expected_hex = encoded.split("$")
            if algorithm != PBKDF2_ALGORITHM:
                logger.warning("Unsupported password hash algorithm %r", algorithm)
                return False
            derived = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                bytes.fromhex(salt_hex),
                int(iterations_raw),
            )
        except (ValueError, TypeError):
            logger.warning("ADMIN_PASSWORD_HASH is malformed; refusing every login")
            return False
        return hmac.compare_digest(derived.hex(), expected_hex)

    configured = settings.ADMIN_PASSWORD
    if not configured:
        return False
    # Hash-then-compare so the work does not depend on the length of the secret.
    return hmac.compare_digest(
        hashlib.sha256(password.encode("utf-8")).hexdigest(),
        hashlib.sha256(configured.encode("utf-8")).hexdigest(),
    )

# ---------------------------------------------------------------------- token


def _sign(signing_input: str) -> str:
    signature = hmac.new(
        settings.ADMIN_SECRET_KEY.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(signature)


def issue_token(username: str, *, ttl_seconds: int | None = None) -> tuple[str, int]:
    """Return (token, expires_in_seconds) for a freshly authenticated admin."""
    require_configured()
    ttl = ttl_seconds if ttl_seconds is not None else settings.ADMIN_SESSION_MINUTES * 60
    issued_at = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": username, "iat": issued_at, "exp": issued_at + ttl}
    signing_input = ".".join(
        (
            _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        )
    )
    return f"{signing_input}.{_sign(signing_input)}", ttl


def decode_token(token: str) -> dict[str, Any]:
    """Validate signature and expiry, then return the payload.

    Raises AdminAuthError for every failure mode so callers cannot accidentally
    treat one as another.
    """
    require_configured()
    if not token:
        raise AdminAuthError("Missing session token.")

    parts = token.split(".")
    if len(parts) != 3:
        raise AdminAuthError("Malformed session token.")
    header_b64, payload_b64, signature = parts

    if not hmac.compare_digest(_sign(f"{header_b64}.{payload_b64}"), signature):
        raise AdminAuthError("Session signature is not valid.")

    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, TypeError) as exc:
        raise AdminAuthError("Session token could not be decoded.") from exc

    if not isinstance(header, dict) or header.get("alg") != "HS256":
        # Refuses the "alg": "none" and algorithm-confusion families outright.
        raise AdminAuthError("Unexpected token algorithm.")
    if not isinstance(payload, dict):
        raise AdminAuthError("Session payload is not an object.")

    expires_at = payload.get("exp")
    if not isinstance(expires_at, int):
        raise AdminAuthError("Session token has no expiry.")
    if time.time() > expires_at:
        raise AdminAuthError("Session token has expired.")

    subject = payload.get("sub")
    # A signature is only meaningful for the configured administrator, so a
    # token signed with the right key but a different subject is still invalid.
    if not isinstance(subject, str) or not hmac.compare_digest(subject, settings.ADMIN_USERNAME):
        raise AdminAuthError("Session subject does not match the configured administrator.")

    return payload


# --------------------------------------------------------------------- sign-in

INVALID_CREDENTIALS = "Incorrect username or password."


def authenticate(username: str, password: str) -> dict[str, Any]:
    """Verify credentials and return a token plus the admin identity.

    The username and the password are always both compared, even when the
    username is wrong, so the response time does not reveal whether a username
    exists.
    """
    require_configured()

    username_ok = hmac.compare_digest(
        (username or "").strip(), settings.ADMIN_USERNAME
    )
    password_ok = verify_password(password or "")

    if not (username_ok and password_ok):
        logger.info("admin.login_failed username=%s", (username or "-")[:40])
        raise AdminAuthError(INVALID_CREDENTIALS)

    token, ttl = issue_token(settings.ADMIN_USERNAME)
    logger.info("admin.login_ok username=%s", settings.ADMIN_USERNAME)
    return {
        "username": settings.ADMIN_USERNAME,
        "token": token,
        "expires_in": ttl,
    }


# ------------------------------------------------------------------------ CLI
#
#   python -m app.services.admin_auth
#
# Prints a ready-to-paste ADMIN_PASSWORD_HASH for a password read from the
# prompt (or from argv). The plaintext is never written to stdout or logged.


def _main() -> int:
    import getpass
    import sys

    if len(sys.argv) > 1:
        password = sys.argv[1]
    else:
        try:
            password = getpass.getpass("Admin password: ")
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            return 1
        if password != getpass.getpass("Confirm: "):
            print("Passwords did not match.", file=sys.stderr)
            return 1

    if not password:
        print("Refusing to hash an empty password.", file=sys.stderr)
        return 1

    print()
    print(f"ADMIN_PASSWORD_HASH={hash_password(password)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
