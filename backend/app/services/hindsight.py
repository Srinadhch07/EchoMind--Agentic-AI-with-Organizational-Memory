from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

RETAIN_PATH = "/v1/default/banks/{bank_id}/memories"
RECALL_PATH = "/v1/default/banks/{bank_id}/memories/recall"
LIST_PATH = "/v1/default/banks/{bank_id}/memories/list"


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


def get_client() -> HindsightClient:
    return HindsightClient()
