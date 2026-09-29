from __future__ import annotations

import json
from typing import Any

from groq import AsyncGroq

from app.config import settings


class GroqError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def get_groq() -> AsyncGroq:
    if not settings.GROQ_API_KEY:
        raise GroqError("GROQ_API_KEY is not set. Add it to .env and restart.")
    return AsyncGroq(api_key=settings.GROQ_API_KEY)


async def complete_json(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 1200,
) -> dict[str, Any]:
    client = get_groq()
    try:
        completion = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise GroqError(f"Groq request failed: {exc}") from exc

    text = completion.choices[0].message.content or "{}"
    try:
        parsed = json.loads(text)
    except ValueError as exc:
        raise GroqError(f"Groq returned non-JSON output: {text[:500]}") from exc

    if not isinstance(parsed, dict):
        raise GroqError(f"Groq returned an unexpected JSON shape: {type(parsed).__name__}")
    return parsed


async def complete_text(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.3,
    max_tokens: int = 900,
) -> str:
    client = get_groq()
    try:
        completion = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        raise GroqError(f"Groq request failed: {exc}") from exc

    return (completion.choices[0].message.content or "").strip()
