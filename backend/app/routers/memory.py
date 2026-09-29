from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.services.hindsight import HindsightError, get_client

router = APIRouter()

TEST_BANK_ID = "echomind-dev-test"
TEST_TAG = "echomind-dev-test"
TEST_PERSONA = "Quill Finch"

MARKER_SIGNALS = ["window seat", "earl grey", "quill finch"]


@router.post("/test")
async def memory_test() -> dict:
    run_id = uuid4().hex[:12]
    marker = f"ECHODEV-{run_id}"
    content = (
        f"EchoMind integration test {marker}. The test persona {TEST_PERSONA} "
        "prefers a window seat on flights and drinks earl grey tea in the morning. "
        "This record exists only to verify the EchoMind retain and recall cycle."
    )
    query = (
        f"EchoMind integration test {marker}: what does the test persona "
        f"{TEST_PERSONA} prefer to drink and which seat does {TEST_PERSONA} choose?"
    )

    client = get_client()
    try:
        retain_raw = await client.retain(
            TEST_BANK_ID,
            [
                {
                    "content": content,
                    "context": "EchoMind automated integration test",
                    "document_id": f"echomind-dev-test-{run_id}",
                    "metadata": {
                        "source": "echomind-dev-test",
                        "run_id": run_id,
                    },
                    "tags": [TEST_TAG],
                }
            ],
        )
        recall_raw = await client.recall(
            TEST_BANK_ID,
            query,
            tags=[TEST_TAG],
            tags_match="any",
            budget="low",
            max_tokens=1024,
        )
    except HindsightError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": exc.message,
                "hindsight_status": exc.status_code,
                "hindsight_response": exc.detail,
            },
        ) from exc

    results = recall_raw.get("results", []) or []
    recalled_text = " ".join(r.get("text", "") for r in results).lower()
    matched = marker.lower() in recalled_text or any(
        signal in recalled_text for signal in MARKER_SIGNALS
    )

    return {
        "verdict": "PASS" if retain_raw.get("success") and matched else "FAIL",
        "run_id": run_id,
        "bank_id": TEST_BANK_ID,
        "marker": marker,
        "retained_content": content,
        "retain": {
            "ok": bool(retain_raw.get("success")),
            "items_count": retain_raw.get("items_count"),
            "async": retain_raw.get("async"),
            "usage": retain_raw.get("usage"),
            "raw": retain_raw,
        },
        "recall": {
            "ok": matched,
            "query": query,
            "result_count": len(results),
            "matched_marker_or_signal": matched,
            "results": results,
        },
    }
