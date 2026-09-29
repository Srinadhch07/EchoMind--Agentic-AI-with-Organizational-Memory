"""Testimonial submissions and moderation.

EchoMind has no database. The only persistent store in the project is Hindsight,
which is the agent's organizational memory: a vector memory that is written to by
the support loop and read back by recall. Using it to hold marketing testimonials
would be wrong in three ways: it would mix visitor-submitted copy into the
organizational memory the support agent reasons over, recall is not a reliable
"list everything newest first" query, and there is no way to move an item from
pending to approved.

So this module uses sqlite3 from the Python standard library. That adds no
dependency, no service to run, and no connection string. The schema is a single
table and the whole store is one file on disk.

Moderation model
----------------
* Every submission is created with status='pending'. Nothing is published
  automatically.
* GET /api/testimonials only ever returns rows that are BOTH approved AND given
  public permission. No email address is ever included in a public response.
* A submission without public permission is never displayed, even after approval.
* Approval is a separate, explicitly authenticated endpoint. There is no public
  approve route.
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings

PENDING = "pending"
APPROVED = "approved"
REJECTED = "rejected"

STATUSES = (PENDING, APPROVED, REJECTED)

SCHEMA = """
CREATE TABLE IF NOT EXISTS testimonials (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT,
    organization  TEXT,
    email         TEXT,
    testimonial   TEXT NOT NULL,
    permission    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending',
    is_sample     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    reviewed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_testimonials_public
    ON testimonials (status, permission, created_at);
"""

# Columns that may be returned to the public. `email` is deliberately absent.
PUBLIC_COLUMNS = "id, name, role, organization, testimonial, created_at, is_sample"

_write_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    path = Path(settings.TESTIMONIAL_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


@contextmanager
def _session() -> Iterator[sqlite3.Connection]:
    """Open a connection, commit or roll back, and always close it.

    `with sqlite3.connect(...) as c:` does NOT close the connection. It only ends
    the transaction, leaving the handle to be reclaimed by the garbage collector.
    That is fine for a one-shot script and a genuine file-descriptor leak in a
    long-running server, so every call site goes through this instead.
    """
    connection = _connect()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _row_to_public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"] or None,
        "organization": row["organization"] or None,
        "testimonial": row["testimonial"],
        "created_at": row["created_at"],
        "is_sample": bool(row["is_sample"]),
    }


def _row_to_moderation(row: sqlite3.Row) -> dict[str, Any]:
    """Full record for moderation, including the contact address."""
    data = _row_to_public(row)
    data["email"] = row["email"] or None
    data["status"] = row["status"]
    data["permission"] = bool(row["permission"])
    data["reviewed_at"] = row["reviewed_at"]
    return data


def init_store() -> None:
    with _session() as connection:
        connection.executescript(SCHEMA)


def create_testimonial(
    *,
    name: str,
    testimonial: str,
    role: str | None = None,
    organization: str | None = None,
    email: str | None = None,
    permission: bool = False,
) -> dict[str, Any]:
    """Store a submission as pending. Never returns email to the caller."""
    init_store()
    record_id = f"tst_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
    with _write_lock, _session() as connection:
        connection.execute(
            """
            INSERT INTO testimonials
                (id, name, role, organization, email, testimonial,
                 permission, status, is_sample, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                record_id,
                name.strip(),
                (role or "").strip() or None,
                (organization or "").strip() or None,
                (email or "").strip() or None,
                testimonial.strip(),
                1 if permission else 0,
                PENDING,
                _now(),
            ),
        )
    return {"id": record_id, "status": PENDING}


def list_public(limit: int = 50) -> list[dict[str, Any]]:
    """Approved + permission-given testimonials, newest first. No email."""
    init_store()
    with _session() as connection:
        rows = connection.execute(
            f"""
            SELECT {PUBLIC_COLUMNS} FROM testimonials
            WHERE status = ? AND permission = 1
            ORDER BY is_sample ASC, created_at DESC
            LIMIT ?
            """,
            (APPROVED, limit),
        ).fetchall()
    return [_row_to_public(row) for row in rows]


def list_pending(limit: int = 50) -> list[dict[str, Any]]:
    """Submissions awaiting review. Moderator view only."""
    init_store()
    with _session() as connection:
        rows = connection.execute(
            f"""
            SELECT {PUBLIC_COLUMNS}, email, status, permission, reviewed_at
            FROM testimonials
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (PENDING, limit),
        ).fetchall()
    return [_row_to_moderation(row) for row in rows]


def approve(testimonial_id: str) -> bool:
    """Move a submission to approved. Returns False if the id is unknown."""
    return _set_status(testimonial_id, APPROVED)


def reject(testimonial_id: str) -> bool:
    """Move a submission to rejected. It will never be shown publicly."""
    return _set_status(testimonial_id, REJECTED)


def unpublish(testimonial_id: str) -> bool:
    """Take a published testimonial back off the public page.

    This moves it to pending rather than rejected: the submitter gave permission
    and the content was fine, so it can be republished after review rather than
    needing to be re-entered.
    """
    return _set_status(testimonial_id, PENDING)


def _set_status(testimonial_id: str, status: str) -> bool:
    init_store()
    with _write_lock, _session() as connection:
        cursor = connection.execute(
            "UPDATE testimonials SET status = ?, reviewed_at = ? WHERE id = ?",
            (status, _now(), testimonial_id),
        )
        return cursor.rowcount > 0


def delete(testimonial_id: str) -> bool:
    """Remove a submission permanently. Returns False if the id is unknown."""
    init_store()
    with _write_lock, _session() as connection:
        cursor = connection.execute(
            "DELETE FROM testimonials WHERE id = ?", (testimonial_id,)
        )
        return cursor.rowcount > 0


def list_by_status(
    status: str | None = None, *, limit: int = 200
) -> list[dict[str, Any]]:
    """Moderation view. Includes the contact address, which the public view never does.

    `status=None` returns every submission, so the admin can see the whole
    queue rather than one bucket at a time.
    """
    init_store()
    with _session() as connection:
        if status is None:
            rows = connection.execute(
                f"""
                SELECT {PUBLIC_COLUMNS}, email, status, permission, reviewed_at
                FROM testimonials
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        else:
            rows = connection.execute(
                f"""
                SELECT {PUBLIC_COLUMNS}, email, status, permission, reviewed_at
                FROM testimonials
                WHERE status = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (status, limit),
            ).fetchall()
    return [_row_to_moderation(row) for row in rows]


def counts() -> dict[str, int]:
    """Real per-status counts for the overview. A plain GROUP BY, nothing inferred."""
    init_store()
    with _session() as connection:
        rows = connection.execute(
            "SELECT status, COUNT(*) AS total FROM testimonials GROUP BY status"
        ).fetchall()
    result = {status: 0 for status in STATUSES}
    for row in rows:
        result[row["status"]] = row["total"]
    result["total"] = sum(result[status] for status in STATUSES)
    return result


def get_status(testimonial_id: str) -> str | None:
    """Current status of one submission, or None if the id is unknown."""
    init_store()
    with _session() as connection:
        row = connection.execute(
            "SELECT status FROM testimonials WHERE id = ?", (testimonial_id,)
        ).fetchone()
    return row["status"] if row else None


def seed_samples() -> int:
    """Insert clearly-labelled sample entries so the section is not empty.

    These are NOT real customers. They are marked is_sample=1 so the UI can
    label them, and they are marked as sample content at the point of display.
    """
    init_store()
    samples = [
        (
            "Sample",
            "Support lead",
            "Illustrative example",
            "We used to answer the same export questions from scratch. Having the "
            "lessons from earlier tickets available in one place made new agents "
            "useful much sooner.",
        ),
        (
            "Sample",
            "Operations manager",
            "Illustrative example",
            "The part that surprised me was the outcome step. Knowing what actually "
            "worked mattered more than what the agent originally suggested.",
        ),
    ]
    inserted = 0
    with _write_lock, _session() as connection:
        existing = connection.execute(
            "SELECT COUNT(*) AS total FROM testimonials WHERE is_sample = 1"
        ).fetchone()["total"]
        if existing:
            return 0
        for name, role, organization, testimonial in samples:
            connection.execute(
                """
                INSERT INTO testimonials
                    (id, name, role, organization, email, testimonial,
                     permission, status, is_sample, created_at, reviewed_at)
                VALUES (?, ?, ?, ?, NULL, ?, 1, ?, 1, ?, ?)
                """,
                (
                    f"tst_sample_{inserted + 1}",
                    name,
                    role,
                    organization,
                    testimonial,
                    APPROVED,
                    _now(),
                    _now(),
                ),
            )
            inserted += 1
    return inserted
