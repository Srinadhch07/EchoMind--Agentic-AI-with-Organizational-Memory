from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

RETAIN_PATH = "/v1/default/banks/{bank_id}/memories"
RECALL_PATH = "/v1/default/banks/{bank_id}/memories/recall"
LIST_PATH = "/v1/default/banks/{bank_id}/memories/list"
MEMORY_PATH = "/v1/default/banks/{bank_id}/memories/{memory_id}"
MEMORY_HISTORY_PATH = "/v1/default/banks/{bank_id}/memories/{memory_id}/history"
STATS_PATH = "/v1/default/banks/{bank_id}/stats"
DOCUMENTS_PATH = "/v1/default/banks/{bank_id}/documents"


class HindsightError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail


def _decode(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text[:1000]


class HindsightClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self.base_url = (base_url or settings.HINDSIGHT_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.HINDSIGHT_API_KEY

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise HindsightError("HINDSIGHT_API_KEY is not set. Add it to .env and restart.")
        return {"Authorization": f"Bearer {self.api_key}"}

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.request(
                    method, url, headers=self._headers(), **kwargs
                )
        except httpx.HTTPError as exc:
            raise HindsightError(
                f"Could not reach Hindsight at {self.base_url}: {exc}", detail=str(exc)
            ) from exc

        if response.status_code >= 400:
            raise HindsightError(
                f"Hindsight {method} {path} failed with HTTP {response.status_code}",
                status_code=response.status_code,
                detail=_decode(response),
            )

        if not response.content:
            return {}
        return _decode(response)

    async def health(self) -> dict:
        return await self._request("GET", "/health")

    async def retain(
        self,
        bank_id: str,
        items: list[dict],
        async_processing: bool = False,
    ) -> dict:
        return await self._request(
            "POST",
            RETAIN_PATH.format(bank_id=bank_id),
            json={"items": items, "async": async_processing},
        )

    async def recall(self, bank_id: str, query: str, **options: Any) -> dict:
        return await self._request(
            "POST",
            RECALL_PATH.format(bank_id=bank_id),
            json={"query": query, **options},
        )

    async def list_memories(
        self,
        bank_id: str,
        limit: int = 50,
        offset: int = 0,
        tags: list[str] | None = None,
    ) -> dict:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if tags:
            params["tags"] = tags
        return await self._request(
            "GET", LIST_PATH.format(bank_id=bank_id), params=params
        )

    # --- Control-plane operations -------------------------------------------
    #
    # Every path below was confirmed against Hindsight's published OpenAPI
    # description before being written. See services/memory_admin.py for what is
    # and is not possible, and why there is deliberately no per-memory delete.

    async def search_memories(
        self,
        bank_id: str,
        *,
        query: str | None = None,
        state: str | None = None,
        fact_type: str | None = None,
        tags: list[str] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """List memories with Hindsight's own filters.

        `query` maps to Hindsight's `q` parameter, which is a real server-side
        search rather than a client-side substring match.
        """
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if query:
            params["q"] = query
        if state:
            params["state"] = state
        if fact_type:
            params["type"] = fact_type
        if tags:
            params["tags"] = tags
        return await self._request(
            "GET", LIST_PATH.format(bank_id=bank_id), params=params
        )

    async def get_memory(self, bank_id: str, memory_id: str) -> dict:
        """Fetch a single memory unit. Returns the full unit, not the list shape."""
        return await self._request(
            "GET", MEMORY_PATH.format(bank_id=bank_id, memory_id=memory_id)
        )

    async def memory_history(self, bank_id: str, memory_id: str) -> dict:
        return await self._request(
            "GET", MEMORY_HISTORY_PATH.format(bank_id=bank_id, memory_id=memory_id)
        )

    async def curate_memory(
        self,
        bank_id: str,
        memory_id: str,
        *,
        text: str | None = None,
        context: str | None = None,
        fact_type: str | None = None,
        entities: list[str] | None = None,
        state: str | None = None,
        reason: str | None = None,
    ) -> dict:
        """Hindsight's "curate" operation (PATCH on one memory unit).

        Supported edits: `text`, `context`, `fact_type` ('world'|'experience'),
        `entities`, and `state` ('valid'|'invalidated'). Setting
        state='invalidated' retires the memory: it stops being returned by
        recall, its links and derived observations are pruned, and it is moved
        to the archive. That is the real, supported way to remove a memory, and
        it is reversible by setting state back to 'valid'.

        Hindsight requires at least one of `text` or `state`.
        """
        payload: dict[str, Any] = {}
        if text is not None:
            payload["text"] = text
        if context is not None:
            payload["context"] = context
        if fact_type is not None:
            payload["fact_type"] = fact_type
        if entities is not None:
            payload["entities"] = entities
        if state is not None:
            payload["state"] = state
        if reason is not None:
            payload["reason"] = reason
        return await self._request(
            "PATCH", MEMORY_PATH.format(bank_id=bank_id, memory_id=memory_id), json=payload
        )

    async def bank_stats(self, bank_id: str) -> dict:
        """Real counts from Hindsight. Never a locally computed guess."""
        return await self._request("GET", STATS_PATH.format(bank_id=bank_id))

    async def list_documents(self, bank_id: str, limit: int = 50) -> dict:
        return await self._request(
            "GET", DOCUMENTS_PATH.format(bank_id=bank_id), params={"limit": limit}
        )


def get_client() -> HindsightClient:
    return HindsightClient()
