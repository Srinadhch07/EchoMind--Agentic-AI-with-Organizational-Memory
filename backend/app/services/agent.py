from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from app.config import settings
from app.models.schemas import AgentResponse, RecalledMemory
from app.services.groq_client import complete_json, complete_text
from app.services.hindsight import HindsightError, get_client

AGENT_SYSTEM_PROMPT = """You are EchoMind, the organizational memory agent for a customer support organisation.

You are not a generic chatbot. You carry the accumulated experience of the organisation:
knowledge distilled from previous support cases and retained in the organisation's memory.

You will be given RECALLED ORGANIZATIONAL MEMORY - facts and outcomes the organisation
learned from earlier interactions with other customers. Treat that memory as institutional
knowledge, not as small talk, and weigh it like this:

- If a memory shows an approach that WORKED for a similar situation, prefer it.
- If a memory shows an approach that FAILED (timeouts, errors, escalations, rework, churn),
  do NOT recommend that approach again. Explicitly avoid it, say what went wrong, and steer
  to whatever the memory says worked instead.
- If a memory is irrelevant to the current request, ignore it silently and answer normally.

Memory must change your behaviour. When the memory is relevant, a good answer departs from
the generic textbook answer and reflects what this organisation has actually learned.

Privacy rules, which override everything above:
- Never name, identify, or quote another customer. Refer to prior experience only as
  "a previous case we handled", "a similar request", or "our own experience with this".
- Never reveal how memory works or that it was consulted: no mention of banks, records,
  documents, scores, counts, indices, retrieval, ranking, or reasoning.
- Never quote stored text verbatim. Restate the lesson in your own words as advice.

Speak to the customer as EchoMind, the support agent that remembers. Never mention memory
storage, databases, retrieval, or that you are an AI model.

Formatting rules for "response":
- Write in Markdown, because the customer interface renders it.
- Use short paragraphs. Do not use headings above level 3; a `###` heading is
  acceptable for a procedure with several steps, nothing larger.
- Use `**bold**` for a term the customer must not miss, and `1.` / `2.` ordered
  lists for step-by-step instructions. Bullet lists for options.
- Use fenced code blocks with a language tag for any command, config or snippet.
- Do not wrap the whole reply in bold, do not use horizontal rules, and do not
  use HTML.
- If the answer is one or two sentences, do not add formatting to it.

Return JSON only, in exactly this shape:
{
  "reasoning": "<one or two sentences: which memories you used and how they changed your answer>",
  "memories_used": [<the 0-based indices of the memories you actually used>],
  "response": "<the reply to the customer>"
}"""


def format_memories(memories: list[dict[str, Any]]) -> str:
    if not memories:
        return "(no relevant organizational memory was found for this request)"
    lines = []
    for i, m in enumerate(memories):
        kind = m.get("type") or "memory"
        lines.append(f"[{i}] ({kind}) {m.get('text', '')}")
        if m.get("context"):
            lines.append(f"     context: {m['context']}")
    return "\n".join(lines)


def is_missing_bank(exc: HindsightError, bank_id: str) -> bool:
    """True only for Hindsight's 'Bank "<id>" not found' 404.

    Hindsight creates a bank on first retain, so a recall against a bank that has
    never been written to legitimately 404s. That means 'no memory yet', not a
    failure. Every other 4xx/5xx, auth failure and network error still raises.
    """
    if exc.status_code != 404:
        return False
    detail = exc.detail
    text = detail if isinstance(detail, str) else json.dumps(detail, default=str)
    return bank_id in text


async def recall_knowledge(
    bank_id: str,
    query: str,
    tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    try:
        recall_raw = await get_client().recall(
            bank_id,
            query,
            budget="mid",
            max_tokens=2048,
            **({"tags": tags, "tags_match": "any"} if tags else {}),
        )
    except HindsightError as exc:
        if is_missing_bank(exc, bank_id):
            return []
        raise
    return recall_raw.get("results", []) or []


async def generate(
    customer: str,
    message: str,
    memories: list[dict[str, Any]],
) -> dict[str, Any]:
    user_prompt = (
        f"RECALLED ORGANIZATIONAL MEMORY (learned from previous experiences)\n"
        f"{format_memories(memories)}\n\n"
        f"CURRENT INTERACTION\n"
        f"Customer: {customer}\n"
        f"Message: {message}\n\n"
        f"Write the reply to this customer."
    )
    return await complete_json(AGENT_SYSTEM_PROMPT, user_prompt)


async def retain_experience(
    bank_id: str,
    customer: str,
    message: str,
    response: str,
    *,
    document_id: str | None = None,
    metadata: dict[str, str] | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    content = f"Customer {customer} reported: {message}\nEchoMind responded: {response}"
    return await get_client().retain(
        bank_id,
        [
            {
                "content": content,
                "context": "EchoMind customer support interaction",
                "document_id": document_id or f"echomind-{uuid4().hex[:12]}",
                "metadata": metadata or {},
                "tags": tags or [bank_id],
            }
        ],
    )


def _to_memory(m: dict[str, Any]) -> RecalledMemory:
    scores = m.get("scores") or {}
    return RecalledMemory(
        id=str(m.get("id", "")),
        text=m.get("text", ""),
        type=m.get("type"),
        context=m.get("context"),
        document_id=m.get("document_id"),
        metadata=m.get("metadata"),
        score=scores.get("final") if isinstance(scores, dict) else None,
    )


def _select_used(
    memories: list[dict[str, Any]], indices: Any
) -> list[dict[str, Any]]:
    if not isinstance(indices, list) or not indices:
        return memories
    used = [memories[i] for i in indices if isinstance(i, int) and 0 <= i < len(memories)]
    return used or memories


async def respond(
    customer: str,
    message: str,
    bank_id: str | None = None,
    tags: list[str] | None = None,
) -> AgentResponse:
    bank = bank_id or settings.HINDSIGHT_BANK_ID
    tag_list = tags or [bank]

    memories = await recall_knowledge(bank, message, tags=tag_list)
    decision = await generate(customer, message, memories)
    reply = (decision.get("response") or "").strip()

    used = _select_used(memories, decision.get("memories_used"))

    document_id = f"echomind-{uuid4().hex[:12]}"
    retained_raw = await retain_experience(
        bank,
        customer,
        message,
        reply,
        document_id=document_id,
        metadata={"customer": customer, "source": "echomind-agent"},
        tags=tag_list,
    )

    return AgentResponse(
        customer=customer,
        response=reply,
        memories_used=[_to_memory(m) for m in used],
        memory_count=len(memories),
        reasoning=decision.get("reasoning"),
        bank_id=bank,
        retained=bool(retained_raw.get("success")),
        retained_document_id=document_id,
        raw_memories=memories,
    )


async def record_outcome(
    bank_id: str | None,
    customer: str,
    lesson: str,
    scenario: str | None = None,
    tags: list[str] | None = None,
) -> tuple[str, bool]:
    bank = bank_id or settings.HINDSIGHT_BANK_ID
    metadata = {"source": "echomind-outcome", "customer": customer}
    if scenario:
        metadata["scenario"] = scenario
    document_id = f"outcome-{uuid4().hex[:12]}"
    retained_raw = await retain_experience(
        bank,
        customer,
        scenario or "Support case outcome",
        lesson,
        document_id=document_id,
        metadata=metadata,
        tags=tags or [bank],
    )
    return document_id, bool(retained_raw.get("success"))


LEARNED_SYSTEM_PROMPT = """You are EchoMind's organisational memory analyst.

You are given organisational memory: facts and outcomes learned from previous customer
support experiences. Summarise what this organisation has actually learned, in plain prose.

Rules:
- Only state what the memory supports. Never invent lessons.
- Group related lessons and say how many distinct experiences support each one.
- Prefer specific, actionable statements over vague generalities.
- If the memory is empty or too thin to support a conclusion, say so plainly.
- Three to five sentences. No bullet points, no preamble, no headings."""


async def summarize_learning(
    bank_id: str | None = None,
    question: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    bank = bank_id or settings.HINDSIGHT_BANK_ID
    tag_list = tags or [bank]
    query = question or "lessons, outcomes and proven approaches learned from customer support experience"
    memories = await recall_knowledge(bank, query, tags=tag_list)

    summary = ""
    if memories:
        summary = await complete_text(
            LEARNED_SYSTEM_PROMPT,
            f"ORGANISATIONAL MEMORY\n{format_memories(memories)}\n\n"
            f"QUESTION\n{query}\n\n"
            "Summarise what this organisation has learned.",
        )

    return {
        "summary": summary,
        "memory_count": len(memories),
        "memories": memories,
    }


async def learning_timeline(
    bank_id: str | None = None,
    limit: int = 50,
    tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    bank = bank_id or settings.HINDSIGHT_BANK_ID
    tag_list = tags or [bank]
    try:
        raw = await get_client().list_memories(bank, limit=limit, tags=tag_list)
    except HindsightError as exc:
        if is_missing_bank(exc, bank):
            return []
        raise

    grouped: dict[str, dict[str, Any]] = {}
    for m in raw.get("items", []) or []:
        doc = m.get("document_id")
        if not doc:
            continue
        entry = grouped.setdefault(
            doc,
            {
                "id": doc,
                "customer": (m.get("metadata") or {}).get("customer") or "Customer",
                "source": (m.get("metadata") or {}).get("source") or "echomind-agent",
                "occurred_at": m.get("mentioned_at") or m.get("updated_at"),
                "lessons": [],
            },
        )
        if m.get("text") and m["text"] not in entry["lessons"]:
            entry["lessons"].append(m["text"])

    timeline = sorted(
        grouped.values(), key=lambda e: e["occurred_at"] or "", reverse=True
    )
    return timeline
