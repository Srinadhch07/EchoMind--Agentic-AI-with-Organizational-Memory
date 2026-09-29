import asyncio
import json
import pathlib
import re
import sys
from uuid import uuid4

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.services.agent import generate, respond, retain_experience

RUN_ID = uuid4().hex[:12]
BANK_ID = f"echomind-loop-test-{RUN_ID}"
TAG = f"loop-{RUN_ID}"
DOC_ID = f"loop-{RUN_ID}-csv-failure"

FAILURE_MESSAGE = (
    "We need to export 50,000 customer records."
)
FAILURE_OUTCOME = (
    "We tried the standard CSV export and it timed out twice, then the job failed. "
    "Escalated to engineering. The fix that worked was a background batched export "
    "that runs in chunks and emails a download link when it completes."
)
FUTURE_MESSAGE = "We need to export 50,000 customer records."

FAILURE_RE = re.compile(r"time[\s\-_]?outs?\b|\bfail(?:ed|s)?\b|\bbroke\b", re.I)
REMEDY_RE = re.compile(r"\bbatch(?:ed)?\b|\bbackground\b", re.I)
LINK_RE = re.compile(r"\blink\b", re.I)
CSV_RE = re.compile(r"\bcsv\b", re.I)


def norm(text: str) -> str:
    for ch in "\u2010\u2011\u2012\u2013\u2014\u2212\uff0d":
        text = text.replace(ch, "-")
    for ch in "\u00a0\u202f\u2009":
        text = text.replace(ch, " ")
    return text


def hits(text: str, terms: list[str]) -> list[str]:
    low = text.lower()
    return [t for t in terms if t in low]

async def main() -> int:
    print("=" * 72)
    print("ECHO MIND LEARNING LOOP TEST")
    print("=" * 72)
    print(f"run_id    : {RUN_ID}")
    print(f"bank_id   : {BANK_ID}")
    print(f"tag       : {TAG}")
    print(f"document  : {DOC_ID}")
    print()

    print("STEP 1-2  seed a FAILED approach (Customer A) into Hindsight")
    seed = await retain_experience(
        BANK_ID,
        "Customer A",
        FAILURE_MESSAGE,
        FAILURE_OUTCOME,
        document_id=DOC_ID,
        metadata={"run_id": RUN_ID, "scenario": "csv-export-timeout", "outcome": "failure"},
        tags=[TAG],
    )
    print(f"  retain success : {seed.get('success')}")
    print(f"  tokens         : {(seed.get('usage') or {}).get('total_tokens')}")
    print()

    print("STEP 3-5  future interaction (Customer B) through the real agent loop")
    result = await respond("Customer B", FUTURE_MESSAGE, bank_id=BANK_ID, tags=[TAG])
    print(f"  memory_count   : {result.memory_count}")
    print(f"  retained       : {result.retained}")
    print()
    print("  RECALLED MEMORIES (freshness check):")
    fresh = 0
    for m in result.raw_memories:
        run = (m.get("metadata") or {}).get("run_id")
        doc = m.get("document_id")
        is_fresh = run == RUN_ID
        fresh += int(is_fresh)
        print(f"    - run_id={run} fresh={is_fresh} doc={doc}")
        print(f"      {(m.get('text') or '')[:160]}")
    print()
    print("  MODEL REASONING:")
    print(f"    {result.reasoning}")
    print()
    print("  MEMORIES USED:")
    for m in result.memories_used:
        print(f"    - {m.text[:160]}")
    print()
    print("  RESPONSE TO CUSTOMER B:")
    print(f"    {result.response}")
    print()

    print("CONTROL   same question, memory deliberately withheld")
    control = await generate("Customer B", FUTURE_MESSAGE, memories=[])
    control_text = control.get("response") or ""
    print(f"    {control_text}")
    print()

    resp_failure = bool(FAILURE_RE.search(norm(result.response)))
    resp_remedy = bool(REMEDY_RE.search(norm(result.response)))
    resp_link = bool(LINK_RE.search(norm(result.response)))
    ctrl_failure = bool(FAILURE_RE.search(norm(control_text)))
    ctrl_remedy = bool(REMEDY_RE.search(norm(control_text)))
    ctrl_csv = bool(CSV_RE.search(norm(control_text)))
    differs = result.response.strip().lower() != control_text.strip().lower()

    checks = {
        "retain seeded": bool(seed.get("success")),
        "memory recalled": result.memory_count > 0,
        "memories are from this run only": fresh == len(result.raw_memories) and fresh > 0,
        "model cited memories by index": len(result.memories_used) > 0,
        "response warns about the failure": resp_failure,
        "response proposes learned batched/background remedy": resp_remedy,
        "response mentions the emailed download link": resp_link,
        "memory-aware answer differs from control": differs,
    }

    print("=" * 72)
    print("CHECKS (memory-attributable)")
    print("=" * 72)
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print()
    print("  -- control diagnostics (printed, NOT gating) --")
    print(f"  control proposed a batched/background remedy : {ctrl_remedy}")
    print(f"  control recommends the failed CSV path       : {ctrl_csv}")
    print(f"  control mentions a failure/timeout           : {ctrl_failure}")
    print("  note: a no-memory model can still guess a plausible batching answer,")
    print("        so control wording is weak evidence; recall freshness + citation")
    print("        are what actually attribute the answer to memory.")
    print()

    memory_influenced = (
        resp_failure and resp_remedy and resp_link and differs and checks[
            "memories are from this run only"
        ]
    )
    verdict = all(checks.values())
    print("=" * 72)
    print(f"MEMORY INFLUENCED THE RESPONSE : {memory_influenced}")
    print(f"OVERALL VERDICT                : {'PASS' if verdict else 'FAIL'}")
    print("=" * 72)

    print("\n--- full agent response json ---")
    print(json.dumps(result.model_dump(), indent=2, default=str)[:3000])
    return 0 if verdict else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
