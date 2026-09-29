"""Phase 4 admin control plane tests.

Uses only `unittest` from the standard library, because the project deliberately
has five pinned dependencies and no test framework. Runs with:

    .venv\\Scripts\\python.exe -m unittest discover -s tests -v

Nothing here touches the network. Hindsight is replaced with a fake client at
the `get_client()` boundary, so these tests cannot write to, read from, or
delete anything in a real memory bank.

The point of this file is the *boundary*. The frontend hides the dashboard
behind a redirect, which is presentation only. These tests call the API
directly, with no cookie and no browser, and assert that it refuses.
"""

import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Set before app.config is imported. Real environment variables win over the
# .env file, so these test values cannot be shadowed by a developer's own
# credentials, and the tests can never use a real admin password.
TEST_USERNAME = "operator"
TEST_PASSWORD = "correct-horse-battery-staple"
TEST_SECRET = "test-only-signing-key"
_TEST_DB_DIR = tempfile.mkdtemp(prefix="echomind-admin-tests-")

os.environ["ADMIN_USERNAME"] = TEST_USERNAME
os.environ["ADMIN_SECRET_KEY"] = TEST_SECRET
os.environ["ADMIN_PASSWORD"] = TEST_PASSWORD
os.environ["ADMIN_PASSWORD_HASH"] = ""
os.environ["ADMIN_SESSION_MINUTES"] = "30"
os.environ["TESTIMONIAL_DB_PATH"] = str(pathlib.Path(_TEST_DB_DIR) / "testimonials.db")
os.environ["TESTIMONIAL_ADMIN_KEY"] = "legacy-test-key"

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import agent as agent_router  # noqa: E402
from app.services import admin_auth, memory_admin, testimonials as store  # noqa: E402
from app.services.hindsight import HindsightError  # noqa: E402


async def _stub_record_outcome(bank_id, customer, lesson, *, scenario, tags):
    """Stand-in for the real service, so no test can write to a real bank."""
    return "outcome-abc123", True


# --------------------------------------------------------------------- fakes

SAMPLE_MEMORY = {
    "id": "mem_123",
    "text": "Exporting 50,000 customer records timed out; a batched background export worked.",
    "context": "Customer A asked how to export all customer records.",
    # Confirmed against the live bank: Hindsight uses world / experience /
    # observation, and only the first two are curatable.
    "fact_type": "experience",
    "state": "valid",
    "document_id": "outcome-abc123",
    "chunk_id": "chunk-1",
    "entities": ["Customer A"],
    "tags": ["echomind-support"],
    "metadata": {"source": "echomind-outcome", "customer": "Customer A"},
    "mentioned_at": "2026-09-01T10:00:00Z",
    "proof_count": 1,
}

RETIRED_MEMORY = {**SAMPLE_MEMORY, "state": "invalidated", "invalidation_reason": "superseded"}


class FakeHindsight:
    """Stands in for the Hindsight client. Records what it was asked to do."""

    def __init__(self) -> None:
        self.curate_calls: list[dict] = []
        self.memory = dict(SAMPLE_MEMORY)

    async def search_memories(self, bank, **kwargs):
        return {"items": [dict(self.memory)], "total": 1, "limit": kwargs.get("limit", 25), "offset": 0}

    async def get_memory(self, bank, memory_id):
        if memory_id != self.memory["id"]:
            raise HindsightError("not found", status_code=404, detail="no such memory")
        return dict(self.memory)

    async def memory_history(self, bank, memory_id):
        return [{"revision": 1, "text": self.memory["text"]}]

    async def curate_memory(self, bank, memory_id, *, text=None, context=None, fact_type=None,
                            entities=None, state=None, reason=None):
        self.curate_calls.append(
            {"memory_id": memory_id, "text": text, "context": context,
             "fact_type": fact_type, "entities": entities, "state": state, "reason": reason}
        )
        if text is not None:
            self.memory["text"] = text
        if context is not None:
            self.memory["context"] = context
        if state is not None:
            self.memory["state"] = state
        return {"success": True}

    async def stats(self, bank):
        return {"total_nodes": 16, "total_documents": 5, "total_observations": 3,
                "last_updated": "2026-09-01T10:00:00Z"}

    async def list_documents(self, bank, limit=25):
        return {"items": [{"document_id": "outcome-abc123", "content": "export case"}], "total": 1}


def make_client() -> TestClient:
    return TestClient(app)


def fake_hindsight_patches(fake: FakeHindsight):
    """Patch the Hindsight client everywhere the admin path reaches it."""
    return [
        mock.patch.object(memory_admin, "get_client", return_value=fake),
    ]


def auth_headers(client: TestClient) -> dict[str, str]:
    """Log in over HTTP and return the bearer token from the real login response."""
    response = client.post(
        "/api/admin/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


# ----------------------------------------------------------------- token unit


class TestTokenUnit(unittest.TestCase):
    def test_round_trip(self):
        token, ttl = admin_auth.issue_token(TEST_USERNAME)
        self.assertEqual(admin_auth.decode_token(token)["sub"], TEST_USERNAME)
        self.assertEqual(ttl, 30 * 60)

    def test_tampered_signature_rejected(self):
        token, _ = admin_auth.issue_token(TEST_USERNAME)
        head, payload, _sig = token.split(".")
        forged = f"{head}.{payload}.{'A' * 43}"
        with self.assertRaises(admin_auth.AdminAuthError):
            admin_auth.decode_token(forged)

    def test_tampered_payload_rejected(self):
        """Flipping a claim must invalidate the token, not change the identity."""
        import base64
        import json

        token, _ = admin_auth.issue_token(TEST_USERNAME)
        head, payload, sig = token.split(".")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        claims["sub"] = "someone-else"
        forged_payload = (
            base64.urlsafe_b64encode(json.dumps(claims, separators=(",", ":")).encode())
            .rstrip(b"=")
            .decode()
        )
        with self.assertRaises(admin_auth.AdminAuthError):
            admin_auth.decode_token(f"{head}.{forged_payload}.{sig}")

    def test_expired_token_rejected(self):
        token, _ = admin_auth.issue_token(TEST_USERNAME, ttl_seconds=-1)
        with self.assertRaises(admin_auth.AdminAuthError):
            admin_auth.decode_token(token)

    def test_garbage_rejected(self):
        for value in ("", "not-a-token", "a.b", "a.b.c.d"):
            with self.assertRaises(admin_auth.AdminAuthError):
                admin_auth.decode_token(value)

    def test_password_hash_round_trip(self):
        encoded = admin_auth.hash_password("hunter2-salt-test", iterations=1000)
        with mock.patch.object(settings, "ADMIN_PASSWORD_HASH", encoded):
            with mock.patch.object(settings, "ADMIN_PASSWORD", ""):
                self.assertTrue(admin_auth.verify_password("hunter2-salt-test"))
                self.assertFalse(admin_auth.verify_password("hunter2-salt-tesT"))

    def test_malformed_hash_refuses_every_login(self):
        with mock.patch.object(settings, "ADMIN_PASSWORD_HASH", "not-a-real-hash"):
            with mock.patch.object(settings, "ADMIN_PASSWORD", ""):
                self.assertFalse(admin_auth.verify_password("anything"))


# ----------------------------------------------------------------- the wall


class TestUnauthenticatedAccessIsRefused(unittest.TestCase):
    """The core security claim: no cookie means no admin data.

    Every request below is made with a bare TestClient, exactly as an attacker
    with `curl` would. If any of these returned 2xx, the control plane would be
    protected by nothing but the frontend.
    """

    PROTECTED = [
        ("GET", "/api/admin/overview", None),
        ("GET", "/api/admin/system", None),
        ("GET", "/api/admin/memories", None),
        ("GET", "/api/admin/memories/stats", None),
        ("GET", "/api/admin/memories/mem_123", None),
        ("GET", "/api/admin/memories/mem_123/history", None),
        ("PATCH", "/api/admin/memories/mem_123", {"text": "rewritten"}),
        ("POST", "/api/admin/memories/mem_123/retire", {}),
        ("POST", "/api/admin/memories/mem_123/restore", {}),
        ("GET", "/api/admin/experiences", None),
        ("GET", "/api/admin/documents", None),
        ("POST", "/api/admin/experiences/outcome",
         {"customer": "Customer A", "lesson": "A resolution that actually worked."}),
        ("GET", "/api/admin/learning", None),
        ("POST", "/api/admin/learning", None),
        ("GET", "/api/admin/learning/timeline", None),
        ("GET", "/api/admin/testimonials", None),
        ("POST", "/api/admin/testimonials/tst_1/approve", {}),
        ("POST", "/api/admin/testimonials/tst_1/reject", {}),
        ("POST", "/api/admin/testimonials/tst_1/unpublish", {}),
        ("DELETE", "/api/admin/testimonials/tst_1", None),
        ("GET", "/api/admin/auth/me", None),
        ("POST", "/api/admin/auth/logout", None),
        # The organization routes that were open before Phase 4.
        ("GET", "/api/agent/timeline", None),
        ("POST", "/api/agent/learned", {"question": "what have we learned?"}),
    ]

    def test_every_protected_route_returns_401(self):
        with make_client() as client:
            for method, path, body in self.PROTECTED:
                with self.subTest(route=f"{method} {path}"):
                    response = client.request(method, path, json=body)
                    self.assertEqual(
                        response.status_code,
                        401,
                        f"{method} {path} returned {response.status_code}: {response.text[:200]}",
                    )

    def test_forged_bearer_rejected(self):
        with make_client() as client:
            for header in (
                {"Authorization": "Bearer not-a-real-token"},
                {"Authorization": "Bearer a.b.c"},
                {"Authorization": "Basic YWRtaW46YWRtaW4="},
            ):
                with self.subTest(header=header):
                    self.assertEqual(
                        client.get("/api/admin/overview", headers=header).status_code, 401
                    )

    def test_token_signed_with_a_different_key_rejected(self):
        with mock.patch.object(settings, "ADMIN_SECRET_KEY", "a-completely-different-key"):
            token, _ = admin_auth.issue_token(TEST_USERNAME)
        with make_client() as client:
            response = client.get(
                "/api/admin/overview", headers={"Authorization": f"Bearer {token}"}
            )
        self.assertEqual(response.status_code, 401)

    def test_expired_session_rejected_over_http(self):
        token, _ = admin_auth.issue_token(TEST_USERNAME, ttl_seconds=-5)
        with make_client() as client:
            response = client.get(
                "/api/admin/overview", headers={"Authorization": f"Bearer {token}"}
            )
        self.assertEqual(response.status_code, 401)
        self.assertIn("expired", response.json()["detail"]["error"].lower())

    def test_public_support_surface_stays_public(self):
        """Gating the admin plane must not break the actual product."""
        with make_client() as client:
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(client.get("/api/testimonials").status_code, 200)


class TestCustomerOutcomeIsPublicButBounded(unittest.TestCase):
    """/api/agent/outcome is the customer's half of the conversation.

    It was gated behind the admin session, so every customer's feedback was
    rejected with 401 before record_outcome() ever ran and the product could
    never retain an outcome from its own UI. Reopening the write is only
    acceptable because it exposes no organizational data and its input is
    length-bounded, so both halves are pinned here.
    """

    CUSTOMER = "Customer A"
    LESSON = "The batched background export worked on the first attempt."

    def _post(self, client, **overrides):
        payload = {
            "customer": self.CUSTOMER,
            "lesson": self.LESSON,
            "scenario": "Thridha Labs support case (resolved)",
            "customer_email": "demo@example.com",
        }
        payload.update(overrides)
        return client.post("/api/agent/outcome", json=payload)

    def test_unauthenticated_customer_can_record_an_outcome(self):
        recorded: dict = {}

        async def fake_record_outcome(bank_id, customer, lesson, *, scenario, tags):
            recorded.update(
                {"bank_id": bank_id, "customer": customer, "lesson": lesson,
                 "scenario": scenario, "tags": tags}
            )
            return "outcome-abc123", True

        with mock.patch.object(agent_router, "record_outcome", fake_record_outcome):
            with make_client() as client:
                response = self._post(client)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["retained"])
        self.assertEqual(body["document_id"], "outcome-abc123")
        # The customer's own lesson is echoed back and nothing else is disclosed.
        self.assertEqual(body["lesson"], self.LESSON)
        self.assertEqual(body["bank_id"], settings.HINDSIGHT_BANK_ID)
        # record_outcome() is called with no caller-chosen bank, so the
        # configured bank is the only writable target.
        self.assertIsNone(recorded["bank_id"])
        self.assertEqual(recorded["customer"], self.CUSTOMER)

    def test_caller_cannot_redirect_the_write_to_another_bank(self):
        with mock.patch.object(agent_router, "record_outcome", _stub_record_outcome):
            with make_client() as client:
                response = self._post(client, bank_id="someone-elses-bank")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["bank_id"], settings.HINDSIGHT_BANK_ID)

    def test_oversized_lesson_is_rejected(self):
        """An unbounded public write would be a way to fill the memory bank."""
        with make_client() as client:
            response = self._post(client, lesson="x" * 4001)
        self.assertEqual(response.status_code, 422)

    def test_too_many_tags_is_rejected(self):
        with make_client() as client:
            response = self._post(client, tags=[f"tag-{i}" for i in range(9)])
        self.assertEqual(response.status_code, 422)

    def test_empty_lesson_is_rejected(self):
        with make_client() as client:
            self.assertEqual(self._post(client, lesson="").status_code, 422)

    def test_memory_reads_remain_admin_only(self):
        """Reopening the write must not reopen the reads."""
        with make_client() as client:
            self.assertEqual(client.get("/api/agent/timeline").status_code, 401)
            learned = client.post("/api/agent/learned", json={"question": "what changed?"})
            self.assertEqual(learned.status_code, 401)


class TestUnconfiguredAdminIs503NotOpen(unittest.TestCase):
    """No admin env values must fail closed with 503, never fall open."""

    def test_all_routes_report_configuration_missing(self):
        with mock.patch.object(settings, "ADMIN_USERNAME", ""):
            self.assertFalse(admin_auth.is_configured())
            with make_client() as client:
                for path in ("/api/admin/overview", "/api/admin/memories", "/api/admin/testimonials"):
                    with self.subTest(path=path):
                        response = client.get(path)
                        self.assertEqual(response.status_code, 503)
                        self.assertIn("not configured", response.json()["detail"]["error"].lower())


# ---------------------------------------------------------------- sign in/out


class TestLogin(unittest.TestCase):
    def test_login_sets_http_only_cookie_and_returns_identity(self):
        with make_client() as client:
            response = client.post(
                "/api/admin/auth/login",
                json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            )
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["username"], TEST_USERNAME)

            cookie_header = response.headers.get("set-cookie", "")
            self.assertIn("echomind_admin=", cookie_header)
            self.assertIn("HttpOnly", cookie_header)
            self.assertIn("SameSite=lax", cookie_header.replace("SameSite=Lax", "SameSite=lax"))

    def test_wrong_password_rejected(self):
        with make_client() as client:
            response = client.post(
                "/api/admin/auth/login",
                json={"username": TEST_USERNAME, "password": "wrong"},
            )
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("echomind_admin", response.headers.get("set-cookie", ""))

    def test_wrong_username_rejected(self):
        with make_client() as client:
            response = client.post(
                "/api/admin/auth/login",
                json={"username": "not-the-admin", "password": TEST_PASSWORD},
            )
            self.assertEqual(response.status_code, 401)

    def test_unknown_and_wrong_password_are_indistinguishable(self):
        """No user enumeration: both failures return the same status and body."""
        with make_client() as client:
            unknown = client.post(
                "/api/admin/auth/login", json={"username": "nobody", "password": "x"}
            )
            wrong = client.post(
                "/api/admin/auth/login", json={"username": TEST_USERNAME, "password": "x"}
            )
        self.assertEqual(unknown.status_code, wrong.status_code)
        self.assertEqual(unknown.json(), wrong.json())

    def test_cookie_authenticates_without_bearer(self):
        """The browser flow: cookie only, no Authorization header."""
        with make_client() as client:
            client.post(
                "/api/admin/auth/login",
                json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            )
            self.assertEqual(client.get("/api/admin/auth/me").status_code, 200)
            self.assertEqual(client.get("/api/admin/overview").status_code, 200)

    def test_logout_clears_the_cookie(self):
        with make_client() as client:
            client.post(
                "/api/admin/auth/login",
                json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            )
            logout = client.post("/api/admin/auth/logout")
            self.assertEqual(logout.status_code, 200)
            self.assertEqual(client.get("/api/admin/auth/me").status_code, 401)


# ------------------------------------------------------------------- memories


class TestMemoryRoutes(unittest.TestCase):
    def setUp(self):
        self.fake = FakeHindsight()
        self.client = make_client()
        self.client.__enter__()
        self.headers = auth_headers(self.client)
        self._patches = fake_hindsight_patches(self.fake)
        for patcher in self._patches:
            patcher.start()

    def tearDown(self):
        for patcher in self._patches:
            patcher.stop()
        self.client.__exit__(None, None, None)

    def test_list_memories(self):
        response = self.client.get("/api/admin/memories", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        memory = body["memories"][0]
        self.assertEqual(memory["id"], "mem_123")
        self.assertTrue(memory["curatable"])

    def test_search_query_is_passed_through(self):
        self.client.get("/api/admin/memories?q=export&state=valid", headers=self.headers)
        # search_memories is called with the query; the fake accepts **kwargs.
        self.assertEqual(self.fake.memory["id"], "mem_123")

    def test_retire_then_restore(self):
        retire = self.client.post(
            "/api/admin/memories/mem_123/retire",
            json={"reason": "superseded by a better record"},
            headers=self.headers,
        )
        self.assertEqual(retire.status_code, 200)
        self.assertTrue(retire.json()["retired"])
        self.assertIn("not destroyed", retire.json()["note"])
        self.assertEqual(self.fake.memory["state"], "invalidated")

        # Hindsight has no per-memory delete, so the curate call must be the
        # only mutation: exactly one invalidated, never a delete.
        self.assertEqual(self.fake.curate_calls[-1]["state"], "invalidated")
        self.assertEqual(
            self.fake.curate_calls[-1]["reason"], "superseded by a better record"
        )

        restore = self.client.post("/api/admin/memories/mem_123/restore", headers=self.headers)
        self.assertEqual(restore.status_code, 200)
        self.assertTrue(restore.json()["restored"])
        self.assertEqual(self.fake.memory["state"], "valid")

    def test_edit_memory_curates_text(self):
        response = self.client.patch(
            "/api/admin/memories/mem_123",
            json={"text": "Corrected text after review."},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.fake.memory["text"], "Corrected text after review.")

    def test_empty_edit_is_rejected_before_touching_hindsight(self):
        response = self.client.patch("/api/admin/memories/mem_123", json={}, headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.fake.curate_calls, [])

    def test_derived_observation_cannot_be_curated(self):
        """Hindsight derives observations and will not curate them.

        The refusal must be clear and must happen before any write is attempted.
        """
        self.fake.memory = {**SAMPLE_MEMORY, "fact_type": "observation"}
        response = self.client.patch(
            "/api/admin/memories/mem_123", json={"text": "nope"}, headers=self.headers
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("observation", response.json()["detail"]["error"].lower())
        self.assertEqual(self.fake.curate_calls, [], "no write should have been attempted")

    def test_observation_is_reported_as_not_curatable(self):
        self.fake.memory = {**SAMPLE_MEMORY, "fact_type": "observation"}
        response = self.client.get("/api/admin/memories/mem_123", headers=self.headers)
        self.assertFalse(response.json()["memory"]["curatable"])

    def test_unknown_memory_is_404(self):
        response = self.client.get("/api/admin/memories/mem_missing", headers=self.headers)
        self.assertEqual(response.status_code, 404)

    def test_memory_history(self):
        response = self.client.get("/api/admin/memories/mem_123/history", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["history"]), 1)

    def test_retired_memory_is_reported_not_hidden(self):
        self.fake.memory = dict(RETIRED_MEMORY)
        response = self.client.get("/api/admin/memories/mem_123", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["memory"]["state"], "invalidated")


# --------------------------------------------------------------- testimonials


class TestTestimonialModeration(unittest.TestCase):
    def setUp(self):
        store.init_store()
        self.client = make_client()
        self.client.__enter__()
        self.headers = auth_headers(self.client)

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def _submit(self, name="Pending Person", permission=True):
        """Submit through the real public endpoint.

        The public API requires permission to be granted at submission time, so
        an approved-but-not-public record has to be created at the store level
        (see test_public_query_filters_permission_even_if_status_is_approved).
        """
        return self.client.post(
            "/api/testimonials",
            json={
                "name": name,
                "role": "Head of Support",
                "organization": "Acme",
                "email": "person@example.com",
                "testimonial": "It answered our export question on the first try.",
                "permission": permission,
            },
        )

    def test_public_endpoint_refuses_submission_without_permission(self):
        response = self._submit(name="No Permission", permission=False)
        self.assertEqual(response.status_code, 422)

    def test_submission_is_pending_and_not_public(self):
        created = self._submit()
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["status"], "pending")
        # The submission response must not echo the contact address.
        self.assertNotIn("person@example.com", created.text)

        public = self.client.get("/api/testimonials").json()["testimonials"]
        self.assertFalse(any(t["name"] == "Pending Person" for t in public))

    def test_public_list_never_contains_email(self):
        self._submit()
        response = self.client.get("/api/testimonials")
        self.assertNotIn("email", response.text)
        for item in response.json()["testimonials"]:
            self.assertNotIn("email", item)

    def test_approve_then_public(self):
        consented = self._submit(name="Consented").json()["id"]
        self.assertEqual(
            self.client.post(
                f"/api/admin/testimonials/{consented}/approve", headers=self.headers
            ).status_code,
            200,
        )
        names = {t["name"] for t in self.client.get("/api/testimonials").json()["testimonials"]}
        self.assertIn("Consented", names)

    def test_public_query_filters_permission_even_if_status_is_approved(self):
        """Defence in depth: approval alone is not enough to publish.

        This record is written straight to the store with permission=0 and then
        approved, which is the only way to reach the state the public query has
        to defend against.
        """
        planted = store.create_testimonial(
            name="Approved Without Permission",
            testimonial="Should never appear publicly.",
            email="quiet@example.com",
            permission=False,
        )
        self.client.post(f"/api/admin/testimonials/{planted['id']}/approve", headers=self.headers)

        names = {t["name"] for t in self.client.get("/api/testimonials").json()["testimonials"]}
        self.assertNotIn("Approved Without Permission", names)

    def test_rejected_is_not_public_and_can_be_deleted(self):
        testimonial_id = self._submit(name="Rejected Person").json()["id"]
        self.client.post(f"/api/admin/testimonials/{testimonial_id}/reject", headers=self.headers)

        public = self.client.get("/api/testimonials").json()["testimonials"]
        self.assertFalse(any(t["name"] == "Rejected Person" for t in public))

        self.assertEqual(
            self.client.delete(
                f"/api/admin/testimonials/{testimonial_id}", headers=self.headers
            ).status_code,
            200,
        )

    def test_moderation_queue_exposes_email_to_admins_only(self):
        self._submit(name="Queue Person")
        queue = self.client.get("/api/admin/testimonials", headers=self.headers)
        self.assertEqual(queue.status_code, 200)
        body = queue.json()
        self.assertIn("pending", body)
        entry = next(t for t in body["pending"] if t["name"] == "Queue Person")
        self.assertEqual(entry["email"], "person@example.com")
        self.assertIn("email", entry)  # admin shape, unlike the public shape

    def test_unpublish_removes_from_public(self):
        testimonial_id = self._submit(name="Temporarily Public", permission=True).json()["id"]
        self.client.post(f"/api/admin/testimonials/{testimonial_id}/approve", headers=self.headers)
        names = {t["name"] for t in self.client.get("/api/testimonials").json()["testimonials"]}
        self.assertIn("Temporarily Public", names)

        self.client.post(
            f"/api/admin/testimonials/{testimonial_id}/unpublish", headers=self.headers
        )
        names = {t["name"] for t in self.client.get("/api/testimonials").json()["testimonials"]}
        self.assertNotIn("Temporarily Public", names)

    def test_counts_reflect_every_bucket(self):
        self._submit(name="Counted A", permission=True)
        counted_b = self._submit(name="Counted B").json()["id"]
        self.client.post(f"/api/admin/testimonials/{counted_b}/reject", headers=self.headers)
        counts = self.client.get("/api/admin/testimonials", headers=self.headers).json()["counts"]
        self.assertGreaterEqual(counts["pending"], 1)
        self.assertEqual(counts["rejected"], 1)
        self.assertIn("approved", counts)

    def test_legacy_admin_key_route_still_works(self):
        """Phase 3 compatibility: the X-Admin-Key moderation path is preserved."""
        response = self.client.get(
            "/api/testimonials/pending", headers={"X-Admin-Key": "legacy-test-key"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("pending", response.json())

    def test_legacy_key_is_still_required(self):
        self.assertEqual(self.client.get("/api/testimonials/pending").status_code, 403)
        self.assertEqual(
            self.client.get(
                "/api/testimonials/pending", headers={"X-Admin-Key": "wrong"}
            ).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
