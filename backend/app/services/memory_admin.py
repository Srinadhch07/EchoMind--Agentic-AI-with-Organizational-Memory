"""Organizational memory control plane backed by Hindsight.

What Hindsight actually supports
--------------------------------
This module was written after reading Hindsight's own OpenAPI description and
making live read-only calls against the configured bank, not from assumption.
The verified capabilities are:

| Capability                        | Hindsight endpoint                                    | Used here |
|-----------------------------------|-------------------------------------------------------|-----------|
| List / search memories            | GET  /memories/list  (`q`, `state`, `type`, `tags`)   | yes       |
| Inspect one memory                | GET  /memories/{memory_id}                            | yes       |
| Edit text / context / type        | PATCH /memories/{memory_id}  ("curate")               | yes       |
| Retire one memory (archive)       | PATCH /memories/{memory_id}  `state="invalidated"`    | yes       |
| Un-retire one memory              | PATCH /memories/{memory_id}  `state="valid"`          | yes       |
| Memory revision history           | GET  /memories/{memory_id}/history                    | yes       |
| Real counts                       | GET  /stats                                           | yes       |
| Source documents                  | GET  /documents                                       | yes       |
| **Delete ONE memory**             | **does not exist**                                    | **no**    |
| Delete ALL memories in a bank     | DELETE /memories  (optional `?type=`)                 | not wired |

The important limitation
------------------------
Hindsight has no per-memory DELETE. The only destructive endpoint is
bank-wide: `DELETE /v1/default/banks/{bank_id}/memories`, documented as "Delete
memory units for a memory bank... This is a destructive operation that cannot be
undone." It takes an optional type filter and nothing narrower, so calling it
would erase the entire organizational memory of the organization rather than the
one memory an administrator selected.

So EchoMind does NOT offer a per-memory delete button, because doing so would
mean either calling the bank-wide clear (destroying far more than the admin
asked for) or pretending a delete happened. Instead the two operations
Hindsight genuinely supports are exposed honestly:

* `retire`  -> state="invalidated" with a reason. The memory stops being
               recalled, is excluded from consolidation, and its links and
               derived observations are pruned. It is archived, not destroyed.
* `restore` -> state="valid". Fully reversible, which is the whole reason to
               prefer this over a hard delete.

The UI labels these as retire/restore, and STATES THE LIMITATION IN THE OPEN, so
no administrator is misled into thinking a memory has been destroyed when it has
been archived. Curating is also restricted by Hindsight to 'world' and
'experience' facts -- 'observation' memories are derived and cannot be curated,
which this module surfaces rather than hiding.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.agent import is_missing_bank
from app.services.hindsight import HindsightError, get_client

logger = logging.getLogger("echomind.memory_admin")

# Hindsight's curation states. 'observation' facts are derived and cannot be
# curated, so they are excluded from the editable set.
CURATABLE_TYPES = ("world", "experience")
VALID_STATES = ("valid", "invalidated")

MEMORY_ITEM_FIELDS = (
    "id",
    "text",
    "context",
    "fact_type",
    "state",
    "document_id",
    "chunk_id",
    "entities",
    "tags",
    "metadata",
    "proof_count",
    "mentioned_at",
    "occurred_start",
    "occurred_end",
    "date",
    "consolidated_at",
    "edited_at",
    "updated_at",
    "invalidation_reason",
    "invalidated_at",
)


class MemoryAdminError(Exception):
    """A memory operation could not be completed."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _bank(bank_id: str | None) -> str:
    return bank_id or settings.HINDSIGHT_BANK_ID


def _as_list(value: Any) -> list[str]:
    """Hindsight returns `entities` as a comma-separated string, tags as a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    return [part.strip() for part in str(value).split(",") if part.strip()]


def _as_mapping(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(k): str(v) for k, v in value.items()}


def normalise_memory(item: dict[str, Any]) -> dict[str, Any]:
    """Project a raw Hindsight memory unit into the safe admin shape.

    Only fields Hindsight actually returns are surfaced. Raw upstream payloads
    are never passed through, so internal detail (embedding state, observation
    scopes, consolidation internals) cannot leak into the dashboard.
    """
    fact_type = item.get("fact_type") or item.get("type")
    state = item.get("state") or "valid"
    return {
        "id": str(item.get("id", "")),
        "text": item.get("text") or "",
        "context": item.get("context") or None,
        "fact_type": fact_type,
        "state": state,
        "document_id": item.get("document_id") or None,
        "chunk_id": item.get("chunk_id") or None,
        "entities": _as_list(item.get("entities")),
        "tags": _as_list(item.get("tags")),
        "metadata": _as_mapping(item.get("metadata")),
        "proof_count": item.get("proof_count"),
        "mentioned_at": item.get("mentioned_at") or None,
        "occurred_start": item.get("occurred_start") or None,
        "occurred_end": item.get("occurred_end") or None,
        "consolidated_at": item.get("consolidated_at") or None,
        "edited_at": item.get("edited_at") or None,
        "updated_at": item.get("updated_at") or None,
        "invalidation_reason": item.get("invalidation_reason") or None,
        "invalidated_at": item.get("invalidated_at") or None,
        # Only world/experience facts can be curated; derived observations cannot.
        "curatable": fact_type in CURATABLE_TYPES,
    }


async def list_memories(
    *,
    bank_id: str | None = None,
    query: str | None = None,
    state: str | None = None,
    fact_type: str | None = None,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    """Search organizational memory. An empty bank is a valid, non-error answer."""
    bank = _bank(bank_id)
    try:
        raw = await get_client().search_memories(
            bank,
            query=query or None,
            state=state or None,
            fact_type=fact_type or None,
            limit=limit,
            offset=offset,
        )
    except HindsightError as exc:
        if is_missing_bank(exc, bank):
            return {
                "bank_id": bank,
                "memories": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
                "query": query or None,
            }
        raise

    items = raw.get("items") or []
    return {
        "bank_id": bank,
        "memories": [normalise_memory(item) for item in items],
        "total": raw.get("total", len(items)),
        "limit": raw.get("limit", limit),
        "offset": raw.get("offset", offset),
        "query": query or None,
    }


async def get_memory(memory_id: str, *, bank_id: str | None = None) -> dict[str, Any]:
    bank = _bank(bank_id)
    try:
        raw = await get_client().get_memory(bank, memory_id)
    except HindsightError as exc:
        if exc.status_code == 404:
            raise MemoryAdminError("No organizational memory with that id.", status_code=404) from exc
        raise
    return {"bank_id": bank, "memory": normalise_memory(raw)}


async def memory_history(memory_id: str, *, bank_id: str | None = None) -> dict[str, Any]:
    bank = _bank(bank_id)
    try:
        raw = await get_client().memory_history(bank, memory_id)
    except HindsightError as exc:
        if exc.status_code == 404:
            return {"bank_id": bank, "memory_id": memory_id, "history": []}
        raise
    return {
        "bank_id": bank,
        "memory_id": memory_id,
        "history": raw if isinstance(raw, list) else (raw.get("history") or raw.get("items") or []),
    }


async def edit_memory(
    memory_id: str,
    *,
    text: str | None = None,
    context: str | None = None,
    fact_type: str | None = None,
    entities: list[str] | None = None,
    bank_id: str | None = None,
) -> dict[str, Any]:
    """Curate a memory: correct its text, context, type or entities.

    This is a genuine Hindsight update. Correcting the text re-embeds the
    memory, drops its derived observations and triggers re-consolidation, so the
    corrected version is what future recall will use.
    """
    if not any(v is not None for v in (text, context, fact_type, entities)):
        raise MemoryAdminError("Nothing to change. Provide at least one field to update.")
    if fact_type is not None and fact_type not in CURATABLE_TYPES:
        raise MemoryAdminError(
            f"Hindsight only allows a fact to be reclassified as "
            f"{' or '.join(CURATABLE_TYPES)}. Derived observations cannot be curated."
        )

    bank = _bank(bank_id)
    try:
        await get_client().curate_memory(
            bank, memory_id, text=text, context=context, fact_type=fact_type, entities=entities
        )
    except HindsightError as exc:
        if exc.status_code == 404:
            raise MemoryAdminError("No organizational memory with that id.", status_code=404) from exc
        raise

    logger.info("memory.edited id=%s bank=%s", memory_id, bank)
    updated = await get_memory(memory_id, bank_id=bank)
    return updated


async def retire_memory(
    memory_id: str, *, reason: str | None = None, bank_id: str | None = None
) -> dict[str, Any]:
    """Retire a single memory by setting its curation state to 'invalidated'.

    This is the real, supported way to stop a memory being used, and it is NOT a
    hard delete. Hindsight excludes the memory from recall and consolidation and
    prunes its links and derived observations, but the record itself is archived
    and can be restored with `restore_memory`.
    """
    bank = _bank(bank_id)
    try:
        await get_client().curate_memory(bank, memory_id, state="invalidated", reason=reason or None)
    except HindsightError as exc:
        if exc.status_code == 404:
            raise MemoryAdminError("No organizational memory with that id.", status_code=404) from exc
        raise

    logger.info("memory.retired id=%s bank=%s reason=%s", memory_id, bank, reason or "-")
    result = await get_memory(memory_id, bank_id=bank)
    result["retired"] = True
    result["note"] = (
        "Retired, not destroyed. Hindsight archives invalidated memories; this one "
        "is no longer recalled and can be restored."
    )
    return result


async def restore_memory(memory_id: str, *, bank_id: str | None = None) -> dict[str, Any]:
    """Return a retired memory to active recall."""
    bank = _bank(bank_id)
    try:
        await get_client().curate_memory(bank, memory_id, state="valid")
    except HindsightError as exc:
        if exc.status_code == 404:
            raise MemoryAdminError("No organizational memory with that id.", status_code=404) from exc
        raise

    logger.info("memory.restored id=%s bank=%s", memory_id, bank)
    result = await get_memory(memory_id, bank_id=bank)
    result["restored"] = True
    return result


async def memory_stats(*, bank_id: str | None = None) -> dict[str, Any]:
    """Real counts straight from Hindsight's stats endpoint."""
    bank = _bank(bank_id)
    try:
        raw = await get_client().bank_stats(bank)
    except HindsightError as exc:
        if is_missing_bank(exc, bank):
            return {
                "bank_id": bank,
                "exists": False,
                "total_memories": 0,
                "total_documents": 0,
                "total_observations": 0,
                "pending_operations": 0,
                "failed_operations": 0,
                "last_memory_write_at": None,
            }
        raise
    return {
        "bank_id": bank,
        "exists": True,
        "total_memories": raw.get("total_nodes"),
        "total_documents": raw.get("total_documents"),
        "total_observations": raw.get("total_observations"),
        "pending_operations": raw.get("pending_operations"),
        "failed_operations": raw.get("failed_operations"),
        "last_memory_write_at": raw.get("last_memory_write_at"),
    }


async def list_documents(*, bank_id: str | None = None, limit: int = 25) -> dict[str, Any]:
    bank = _bank(bank_id)
    try:
        raw = await get_client().list_documents(bank, limit=limit)
    except HindsightError as exc:
        if is_missing_bank(exc, bank):
            return {"bank_id": bank, "documents": [], "total": 0}
        raise
    items = raw.get("items") or []
    return {
        "bank_id": bank,
        "documents": [
            {
                "document_id": str(item.get("document_id") or item.get("id") or ""),
                "content": item.get("content") or "",
                "metadata": _as_mapping(item.get("metadata")),
                "created_at": item.get("created_at"),
            }
            for item in items
        ],
        "total": raw.get("total", len(items)),
    }
