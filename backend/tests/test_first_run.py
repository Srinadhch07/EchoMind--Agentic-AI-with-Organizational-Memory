import asyncio
import pathlib
import sys
from uuid import uuid4

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx

from app.config import settings
from app.services.agent import is_missing_bank, respond
from app.services.hindsight import HindsightError, get_client

RUN_ID = uuid4().hex[:12]
BANK_ID = f"echomind-firstrun-test-{RUN_ID}"

FIRST_MESSAGE = "We need to export 50,000 customer records."
SECOND_MESSAGE = "We need to export 50,000 records."


def bank_exists() -> bool:
    res = httpx.get(
        f"{settings.HINDSIGHT_BASE_URL}/v1/default/banks",
        headers={"Authorization": f"Bearer {settings.HINDSIGHT_API_KEY}"},
        timeout=30,
    )
    res.raise_for_status()
    return any(b["bank_id"] == BANK_ID for b in res.json().get("banks", []))


async def main() -> int:
    print("=" * 72)
    print("FIRST-RUN BANK BEHAVIOUR TEST")
    print("=" * 72)
    print(f"run_id  : {RUN_ID}")
    print(f"bank_id : {BANK_ID}")
    print()

    print("STEP 1  confirm the bank does not exist yet")
    exists = bank_exists()
    print(f"  bank present before test : {exists}")

    print()
    print("STEP 2  raw RECALL against the missing bank must 404")
    raw_404 = False
    try:
        await get_client().recall(BANK_ID, "anything")
    except HindsightError as exc:
        raw_404 = exc.status_code == 404
        print(f"  direct recall -> HTTP {exc.status_code}: {exc.detail}")
        print(f"  is_missing_bank() recognises it : {is_missing_bank(exc, BANK_ID)}")
    else:
        print("  direct recall unexpectedly succeeded")
    print()

    print("STEP 3  first interaction must be treated as 'no memory yet'")
    first = await respond("Customer A", FIRST_MESSAGE, bank_id=BANK_ID, tags=[BANK_ID])
    print(f"  memory_count : {first.memory_count}")
    print(f"  retained     : {first.retained}")
    print(f"  response     : {first.response[:220]}")
    print()

    print("STEP 4  the RETAIN must have created and populated the bank")
    exists_after = bank_exists()
    print(f"  bank present after first interaction : {exists_after}")
    print()

    print("STEP 5  second, similar interaction must recall the first experience")
    second = await respond("Customer B", SECOND_MESSAGE, bank_id=BANK_ID, tags=[BANK_ID])
    print(f"  memory_count    : {second.memory_count}")
    print(f"  memories_used   : {len(second.memories_used)}")
    print(f"  retained        : {second.retained}")
    for m in second.memories_used:
        print(f"    - {m.text[:150]}")
    print(f"  reasoning       : {second.reasoning}")
    print(f"  response        : {second.response[:400]}")
    print()

    checks = {
        "bank absent before test": not exists,
        "raw recall 404s on missing bank": raw_404,
        "first interaction: no memory, no error": first.memory_count == 0,
        "first interaction: Groq answered": len(first.response) > 0,
        "first interaction: retain succeeded": first.retained,
        "bank created by first retain": exists_after,
        "second interaction: memory recalled": second.memory_count > 0,
        "second interaction: memory used": len(second.memories_used) > 0,
        "second interaction differs from first": second.response != first.response,
    }

    print("=" * 72)
    print("CHECKS")
    print("=" * 72)
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    verdict = all(checks.values())
    print()
    print(f"OVERALL VERDICT : {'PASS' if verdict else 'FAIL'}")
    print("=" * 72)
    return 0 if verdict else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
