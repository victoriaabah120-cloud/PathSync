#!/usr/bin/env python3
"""Live verification procedure for the PathSync School Result Compiler.

Standard library only: urllib, json, hmac, hashlib, threading. Nothing is
installed and nothing is imported from the application, so this file can be run
from a laptop, a CI job or a Render shell.

WHAT IT DOES
    Drives the deployed API exactly the way the browser does: real Supabase
    sign-ups, real bearer tokens, real Paystack webhook signatures. Every check
    prints one line:

        PASS 09  scores above the configured maximum are rejected
        FAIL 13  compile produces totals and positions  |  position for <id>=2 (want 1)

    A FAIL prints the HTTP status and a short body excerpt for the request that
    did not behave, so the run is diagnosable without a debugger.

REQUIRED ENVIRONMENT
    SUPA_KEY                publishable (anon) key of the Supabase project.
                            Read from the environment, never hardcoded.
    PAYSTACK_SECRET_KEY     optional, and it must match the value the API holds.
                            Cases 2c, 3b and 18 need it: without it no payment can
                            be confirmed and no valid x-paystack-signature can be
                            produced, so those cases are SKIPped as NOT COVERED.
                            A signature that cannot be forged is the whole point,
                            so the harness never fakes one.
    VERIFY_EMAIL_DOMAIN     optional, default example.test
    PATHSYNC_API            optional, default https://pathsync.onrender.com

PHASES
    A real card payment and one SQL fixture sit in the middle of the flow, so
    the procedure is split into phases that can be run minutes apart. State
    (test account emails, school ids, ids of everything created) is kept in
    --state, default pathsync_verify_state.json.

    setup     cases 1, 2, 3a, 6, 7 + the academic structure
    pay       case 3b, after the checkout is paid in a browser
    teach     cases 5, 4, 8, 9, 10, 11, 12
    compile   cases 13, 14
    results   cases 15, 16
    webhook   case 18
    expiry    case 17, needs the SQL fixture the script prints
    all       setup -> pay -> teach -> compile -> results -> webhook, stopping
              with instructions at the first phase that needs a human

TYPICAL RUN
    export SUPA_KEY=...            # publishable anon key
    export PAYSTACK_SECRET_KEY=... # test secret key, only for case 18
    python3 backend/scripts/verify_results_live.py --phase setup
    # open the printed authorization_url, pay with the Paystack test card
    python3 backend/scripts/verify_results_live.py --phase pay
    python3 backend/scripts/verify_results_live.py --phase teach
    python3 backend/scripts/verify_results_live.py --phase compile
    python3 backend/scripts/verify_results_live.py --phase results
    python3 backend/scripts/verify_results_live.py --phase webhook
    python3 backend/scripts/verify_results_live.py --phase expiry   # prints SQL first

OFFLINE MODES
    --notes      print what every case proves
    --teardown   print the SQL that removes the test data (the API cannot)
    --dry-run    print the phase plan and the environment it would use
    --self-test  exercise the pure helpers (JWT decode, HMAC signing, state)

SAFETY
    * Creates its own users, schools and records, all suffixed with a run id.
    * Deletes nothing: the module exposes no delete endpoints (see TEARDOWN_SQL).
    * Refuses to run against anything but the configured base URL, and refuses
      to start if SUPA_KEY is missing.
    * Exit code 0 = no FAIL and no BLOCK; 1 = at least one FAIL or BLOCK;
      2 = the run could not start (missing environment, unreachable API).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_BASE = os.environ.get("PATHSYNC_API", "https://pathsync.onrender.com").rstrip("/")
AUTH_BASE = os.environ.get("SUPABASE_AUTH_URL", "https://xmhscjxirtaufafqzhll.supabase.co").rstrip("/")
SUPA_KEY = os.environ.get("SUPA_KEY", "").strip()
PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "").strip()
EMAIL_DOMAIN = os.environ.get("VERIFY_EMAIL_DOMAIN", "example.test").strip() or "example.test"

DEFAULT_STATE = "pathsync_verify_state.json"
DEFAULT_CAPACITY_FILL_LIMIT = 150  # do not send more than this many student creates

# Plans seeded by supabase/migrations/2026-11-26-school-result-compiler.sql.
EXPECTED_PLANS = {
    "basic": {"max_students": 100, "monthly_price_kobo": 2_500_000},
    "standard": {"max_students": 300},
    "growth": {"max_students": 600},
    "premium": {"max_students": 1000},
    "enterprise": {"max_students": None},
}

# Scores entered by the subject teacher. The numbers are chosen so every
# assertion below has one correct answer: distinct totals, distinct positions,
# a boundary maximum, and a range of grades.
SUBJECT_1_SCORES = {0: (10, 9, 8, 60), 1: (8, 7, 6, 55), 2: (5, 4, 3, 40)}   # 87, 76, 52
SUBJECT_2_SCORES = {0: (9, 9, 9, 63), 1: (7, 7, 7, 49), 2: (6, 6, 6, 42)}    # 90, 70, 60
TOTALS = {0: 177.0, 1: 146.0, 2: 112.0}
AVERAGES = {0: 88.5, 1: 73.0, 2: 56.0}
POSITIONS = {0: 1, 1: 2, 2: 3}
CLASS_AVERAGE = 72.5
SUBJECT_1_GRADES = {0: "A1", 1: "A1", 2: "C6"}
SUBJECT_2_GRADES = {0: "A1", 1: "B2", 2: "C4"}

NOTES = {
    "1": "Registration is not an open door: the caller becomes school_admin of exactly one school, the school records created_by = the caller, and a second registration by the same account is refused (409). Proves the admin-to-school binding.",
    "2": "Pricing is server data, not hardcoded: the five seeded plans come back with their capacities and kobo prices, and checkout creates a pending subscription for the chosen plan with the right amount. Proves plan selection and price integrity.",
    "3a": "A checkout is only an intent: after checkout the school reads as pending, an unknown reference is 404, and verifying an unpaid reference is 402 and leaves the subscription pending. Proves no client-side or guessed activation.",
    "3b": "Activation is server-verified: only after Paystack confirms the payment does the subscription become active, one paid invoice appears, and re-verifying the same reference is idempotent (already=true, still one invoice). Proves the payment gate and idempotency.",
    "4": "Capacity is enforced on the server at write time: the plan's 100-student ceiling is reached, the next create is 409 with needs_upgrade/capacity/used, and GET /schools/me reports used == capacity. Proves the plan limit actually blocks data, not just the UI.",
    "4b": "Advisory concurrency probe: with one slot left, four simultaneous creates must yield exactly one success. A WARN here means the capacity check is read-then-insert and can overshoot under load; case 4 remains the acceptance criterion.",
    "5": "An admin can build the academic structure and enrol students: session, term, class, subjects, class-subject links and three students all persist, and the class roster returns exactly those students. Proves the data model and enrolment.",
    "6": "Invitations are single-use and email-bound: the invite creates an invited member with a code, the invited account activates with it and becomes a teacher of that school, reusing the code is 409, and another account presenting the code is 403. Proves invitation control.",
    "7": "One teacher account can hold several responsibilities at once: two subject assignments and a form-teacher assignment coexist, and responsibilities returns both lists for the same member. Proves the multi-responsibility model.",
    "8": "Assignment is the permission boundary: a teacher of the same school with no assignment for that class and subject gets 403 on the sheet and on the write, and sees empty responsibility lists. Proves server-side authorisation, not UI hiding.",
    "9": "Score validation uses the school's configured maxima: 11/10, 71/70 and -1 are rejected with 422 and nothing is persisted, while the exact maximum (10/10/10/70) is accepted. Proves bounds are inclusive and enforced before storage.",
    "10": "Submission is refused while any enrolled student is incomplete: two of three rows saved, submit returns 409 listing the missing student, and the sheet stays unlocked. Proves no partial result set can be submitted.",
    "11": "Once every student has a complete row the submit succeeds, the sheet records submitted_at and reports locked. Proves the happy path and the state transition.",
    "12": "A submitted sheet is locked: a second submit and a score edit both return 409 and the stored score is unchanged. Proves submitted data cannot be silently altered.",
    "13": "Compilation is correct arithmetic and ranking: totals equal CA1+CA2+CA3+Exam, averages are total/subjects, positions follow the competition policy, class and subject statistics match, and the compilation is stored as draft then submitted by the form teacher. Proves the results engine on real data.",
    "13b": "The form teacher can hand the compiled class to the administrator, moving the compilation from draft to submitted. Proves the form-teacher step is a separate, authorised transition.",
    "14": "Approval and publishing are ordered and final: approve only works on a submitted compilation, publish only on an approved one, a further compile after publish is 409 (locked), and the audit trail records compiled/submitted/approved/published. Proves the lifecycle and the lock.",
    "15": "A student reads only their own published result: their report card returns their own id, totals, position and two subjects, a classmate-less student in the same school gets an empty list and 403 on the report. Proves student-level isolation.",
    "16": "Tenancy is enforced by the school id on every query: another school's admin gets 404 for that compilation (approve, publish) and for the sheet, and their own student list is empty. Proves cross-school isolation cannot be bypassed by knowing an id.",
    "17": "Expiry is derived from current_period_end, not a flag: with the period in the past, reads (school, students, sheet, report card) still return 200 while premium writes (student create, compile) return 402 with an expiry message. Proves data is never held hostage and writes are gated.",
    "2c": "Checkout reaches Paystack and returns a hosted authorization_url. Skipped when the API has no PAYSTACK_SECRET_KEY: a 503 from /webhooks/paystack proves the credential is absent, and no client-side trick can substitute for it.",
    "2d": "The amount is read from the plan row: switching the same checkout to the annual cycle changes the recorded amount to the annual price, and an unknown plan code is 404. Proves the browser cannot name its own price.",
    "4g": "Without a live plan the compiler is closed for writes but open for reads: students, subjects, classes and the school all return 200, while a student create returns 402 with a readable detail. Proves the gate restricts operations instead of hiding history.",
    "8s": "POST /schools/me/sheets is the entry point a teacher needs before any score can exist. It answers 402 while the plan is not live (so the route is deployed and gated, not missing) and 403 for a student account. Proves the sheet can be opened at all and only by staff.",
    "18": "The webhook trusts cryptography, not the caller: a wrong signature is 401 and stores nothing, a correctly signed event is processed once, and the replay returns duplicate=true without creating a second invoice. Proves signature verification and idempotent event handling.",
}

# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def excerpt(resp, limit: int = 320) -> str:
    text = " ".join((resp.text or "").split())
    return text[:limit] + ("..." if len(text) > limit else "")


def near(expected, tol: float = 0.05):
    def check(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and abs(float(value) - float(expected)) <= tol

    return check


def nonempty(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def check_fields(obj, spec: dict, label: str = "") -> list[str]:
    """Compare a response object against {field: expected-or-callable}."""
    if not isinstance(obj, dict):
        return [f"{label or 'body'} is not a JSON object"]
    problems = []
    for field, want in spec.items():
        got = obj.get(field)
        if callable(want):
            if not want(got):
                problems.append(f"{label}{field}={got!r}")
        elif got != want:
            problems.append(f"{label}{field}={got!r} (want {want!r})")
    return problems


def detail_of(resp):
    if isinstance(resp.data, dict):
        return resp.data.get("detail")
    return None


def detail_text(resp) -> str:
    value = detail_of(resp)
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True)
    return str(value or "")


def jwt_claims(token: str) -> dict:
    """Read the payload of a Supabase access token. No verification: this is the
    client's own token and the server verifies it; we only need the subject id."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
    except Exception:
        return {}


def make_password() -> str:
    return "Vf-" + uuid.uuid4().hex[:20] + "!9aA"


# ---------------------------------------------------------------------------
# Report: one PASS/FAIL line per case
# ---------------------------------------------------------------------------
class Report:
    def __init__(self):
        self.records: list[tuple[str, str, str, str]] = []
        self._lock = threading.Lock()

    def _add(self, status: str, case: str, title: str, detail: str = ""):
        with self._lock:
            self.records.append((status, case, title, detail))
            line = f"{status:<5} {case:<4} {title}"
            if detail:
                line += f"  |  {detail}"
            print(line, flush=True)

    def check(self, case: str, title: str, ok: bool, detail: str = ""):
        self._add("PASS" if ok else "FAIL", case, title, "" if ok else detail)

    def skip(self, case: str, title: str, reason: str):
        self._add("SKIP", case, title, reason)

    def block(self, case: str, title: str, reason: str):
        self._add("BLOCK", case, title, reason)

    def warn(self, case: str, title: str, detail: str):
        self._add("WARN", case, title, detail)

    def setup(self, message: str):
        print(f"SETUP {message}", flush=True)

    def counts(self) -> dict:
        out = {"PASS": 0, "FAIL": 0, "SKIP": 0, "WARN": 0, "BLOCK": 0}
        for status, *_ in self.records:
            out[status] = out.get(status, 0) + 1
        return out

    def failed(self) -> bool:
        return any(status in ("FAIL", "BLOCK") for status, *_ in self.records)

    def summary(self) -> int:
        counts = self.counts()
        print("\n" + "=" * 78)
        print(
            f"{counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['SKIP']} SKIP, "
            f"{counts['WARN']} WARN, {counts['BLOCK']} BLOCK"
        )
        if counts["SKIP"]:
            cases = ", ".join(case for status, case, *_ in self.records if status == "SKIP")
            print(f"NOT VERIFIED (skipped): {cases}")
        if counts["BLOCK"]:
            cases = ", ".join(case for status, case, *_ in self.records if status == "BLOCK")
            print(f"BLOCKED: {cases}")
        print("=" * 78)
        return 1 if self.failed() else 0


# ---------------------------------------------------------------------------
# Durable state between phases
# ---------------------------------------------------------------------------
class State:
    def __init__(self, path: str):
        self.path = path
        self.data = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    self.data = json.load(handle)
            except (OSError, ValueError):
                self.data = {}

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value):
        self.data[key] = value
        self.save()
        return value

    def sub(self, key) -> dict:
        return self.data.setdefault(key, {})

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(self.data, handle, indent=2, sort_keys=True)
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def run_id(self) -> str:
        return self.data.setdefault("run_id", datetime.now(timezone.utc).strftime("%y%m%d%H%M%S"))


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Response:
    __slots__ = ("status", "data", "text", "method", "url")

    def __init__(self, status, data, text, method="", url=""):
        self.status = status
        self.data = data
        self.text = text
        self.method = method
        self.url = url

    def ok(self) -> bool:
        return 200 <= self.status < 300


def http(method, url, *, token=None, body=None, raw=None, headers=None, timeout=60) -> Response:
    payload = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
    request = urllib.request.Request(url, data=payload, method=method)
    request.add_header("Accept", "application/json")
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            text = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        text = exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        status = 0
        text = f"network error: {exc.reason}"
    except Exception as exc:  # timeouts, resets, TLS
        status = 0
        text = f"network error: {exc}"

    data = None
    if text:
        try:
            data = json.loads(text)
        except ValueError:
            data = None
    return Response(status, data, text, method, url)


def signed_request(method, path, *, token=None, body=None, query=None, expect=(200,), quiet=False, timeout=60) -> Response:
    """Bearer-authenticated request to the PathSync API.

    Prints the status and a short body excerpt whenever the status is not one of
    ``expect``, so a failure is readable without rerunning with a debugger.
    """
    url = API_BASE + path
    if query:
        cleaned = {k: v for k, v in query.items() if v is not None}
        if cleaned:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(cleaned)
    resp = http(method, url, token=token, body=body, timeout=timeout)
    if expect is not None and resp.status not in expect and not quiet:
        wanted = ", ".join(str(code) for code in expect)
        print(f"    ! {method} {path} -> {resp.status} (expected {wanted}): {excerpt(resp)}", flush=True)
    return resp


def webhook_post(payload, *, secret=None, signature=None) -> Response:
    """POST /webhooks/paystack with an exact-byte body and HMAC-SHA512 header."""
    raw = payload if isinstance(payload, bytes) else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {}
    if signature is None and secret:
        signature = hmac.new(secret.encode("utf-8"), raw, hashlib.sha512).hexdigest()
    if signature:
        headers["x-paystack-signature"] = signature
    return http("POST", f"{API_BASE}/webhooks/paystack", raw=raw, headers=headers, timeout=60)


def payments_probe() -> tuple[bool, str]:
    """Does the deployed API actually hold Paystack credentials?

    The webhook refuses an unsigned event with 401 once PAYSTACK_SECRET_KEY is
    set, and answers 503 before it looks at the signature when it is not. That
    makes an empty signed-less POST a safe, side-effect free probe: nothing is
    stored either way.
    """
    resp = http(
        "POST", f"{API_BASE}/webhooks/paystack",
        raw=b"{}", headers={"Content-Type": "application/json"}, timeout=60,
    )
    if resp.status == 401:
        return True, "webhook rejects an unsigned event with 401"
    if resp.status == 503:
        return False, "webhook answers 503 (payments are not configured)"
    return False, f"webhook probe returned {resp.status}: {excerpt(resp, 120)}"


# ---------------------------------------------------------------------------
# Supabase auth
# ---------------------------------------------------------------------------
class AuthError(RuntimeError):
    pass


class Blocked(RuntimeError):
    """A precondition that only a human or a deployment change can satisfy."""


def sign_in_or_up(account: dict) -> tuple[str, str]:
    email, password = account["email"], account["password"]
    signup = http(
        "POST",
        f"{AUTH_BASE}/auth/v1/signup",
        body={"email": email, "password": password},
        headers={"apikey": SUPA_KEY},
    )
    if signup.status == 429:
        raise Blocked("Supabase auth rate limit reached while signing up test users. Wait an hour and re-run.")
    token = signup.data.get("access_token") if isinstance(signup.data, dict) else None
    if signup.status == 200 and token:
        return token, jwt_claims(token).get("sub")

    signin = http(
        "POST",
        f"{AUTH_BASE}/auth/v1/token?grant_type=password",
        body={"email": email, "password": password},
        headers={"apikey": SUPA_KEY},
    )
    if signin.status == 200 and isinstance(signin.data, dict) and signin.data.get("access_token"):
        token = signin.data["access_token"]
        user_id = (signin.data.get("user") or {}).get("id") or jwt_claims(token).get("sub")
        return token, user_id

    text = excerpt(signin, 400).lower()
    if signin.status == 429:
        raise Blocked("Supabase auth rate limit reached while signing in. Wait an hour and re-run.")
    if "not confirmed" in text or "email not confirmed" in text:
        raise Blocked(
            "Supabase requires email confirmation, so the test users cannot sign in. "
            "For the test project turn off Authentication -> Providers -> Email -> Confirm email, "
            "or create the users with the service role and email_confirm=true."
        )
    if "signups not allowed" in text or "signup is disabled" in text:
        raise Blocked("Email sign-ups are disabled in the Supabase project; enable them for the test run.")
    raise AuthError(f"could not authenticate {email}: {signin.status} {excerpt(signin, 400)}")


class Ctx:
    def __init__(self, state: State, report: Report):
        self.state = state
        self.report = report
        self._tokens: dict[str, str] = {}

    def account(self, key: str) -> dict:
        accounts = self.state.sub("accounts")
        account = accounts.get(key)
        if not account:
            run_id = self.state.run_id()
            account = {"email": f"pathsync-verify-{run_id}-{key}@{EMAIL_DOMAIN}", "password": make_password()}
            accounts[key] = account
            self.state.save()
        return account

    def token(self, key: str) -> str:
        if key not in self._tokens:
            account = self.account(key)
            token, user_id = sign_in_or_up(account)
            account["user_id"] = user_id
            self.state.save()
            self._tokens[key] = token
        return self._tokens[key]

    def user_id(self, key: str) -> str:
        self.account(key)
        return self.account(key).get("user_id") or jwt_claims(self.token(key)).get("sub")


# ---------------------------------------------------------------------------
# Fixtures and teardown
# ---------------------------------------------------------------------------
def sheet_fixture_sql(ctx: Ctx, subject_id: str) -> str:
    st = ctx.state
    return (
        "-- Temporary workaround: the API has no route that creates a score sheet.\n"
        "-- Run once in the Supabase SQL editor, then pass the returned id back with\n"
        "--   --set-sheet subject1=<id>\n"
        "insert into public.src_score_sheets (school_id, session_id, term_id, class_id, subject_id, status)\n"
        f"values ('{st.get('school_id')}', '{st.get('session_id')}', '{st.get('term_id')}', "
        f"'{st.get('class_id')}', '{subject_id}', 'draft')\n"
        "on conflict (session_id, term_id, class_id, subject_id) do update set status = 'draft'\n"
        "returning id;\n"
    )


def expiry_fixture_sql(ctx: Ctx) -> str:
    return (
        "-- Case 17 fixture: expire the school's live subscription.\n"
        "-- Run in the Supabase SQL editor, then re-run with --phase expiry --fixture-applied\n"
        "update public.src_subscriptions\n"
        "   set current_period_end = now() - interval '1 day'\n"
        f" where school_id = '{ctx.state.get('school_id')}'\n"
        "   and status = 'active';\n"
    )


def teardown_sql(ctx: Ctx) -> str:
    run_id = ctx.state.run_id() or "<run id>"
    slug = f"pathsync-verify%{run_id}%"
    event = f"evt_verify_{run_id}%"
    school_filter = f"select id from public.src_schools where slug like '{slug}'"
    lines = [
        "-- The module exposes no DELETE endpoints, so nothing created by this run can be",
        "-- removed through the API. Run this in the Supabase SQL editor (service role).",
        "-- Children are deleted first because src_enrolments.class_id, src_score_sheets.class_id,",
        "-- src_compilations.class_id and src_schools.created_by use ON DELETE RESTRICT.",
        "begin;",
        f"delete from public.src_compiled_results where school_id in ({school_filter});",
        f"delete from public.src_result_events    where school_id in ({school_filter});",
        f"delete from public.src_compilations     where school_id in ({school_filter});",
        f"delete from public.src_scores           where school_id in ({school_filter});",
        f"delete from public.src_score_sheets     where school_id in ({school_filter});",
        f"delete from public.src_assessment_configs where school_id in ({school_filter});",
        f"delete from public.src_assignments      where school_id in ({school_filter});",
        f"delete from public.src_class_subjects   where school_id in ({school_filter});",
        f"delete from public.src_enrolments       where school_id in ({school_filter});",
        f"delete from public.src_students         where school_id in ({school_filter});",
        f"delete from public.src_terms            where school_id in ({school_filter});",
        f"delete from public.src_sessions         where school_id in ({school_filter});",
        f"delete from public.src_classes          where school_id in ({school_filter});",
        f"delete from public.src_subjects         where school_id in ({school_filter});",
        f"delete from public.src_invoices         where school_id in ({school_filter});",
        f"delete from public.src_payments         where school_id in ({school_filter});",
        f"delete from public.src_subscriptions    where school_id in ({school_filter});",
        f"delete from public.src_school_members   where school_id in ({school_filter});",
        f"delete from public.src_schools          where slug like '{slug}';",
        f"delete from public.src_webhook_events   where event_id like '{event}';",
        "-- Auth users are last: src_schools.created_by is ON DELETE RESTRICT.",
        f"delete from auth.users where email like 'pathsync-verify-{run_id}-%';",
        "commit;",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Shared helpers for the phases
# ---------------------------------------------------------------------------
def require(ctx: Ctx, *keys):
    missing = [key for key in keys if not ctx.state.get(key)]
    if missing:
        raise Blocked(f"missing state {missing}; run the earlier phase first (see --dry-run)")


def skip_phase(report: Report, cases: list[tuple[str, str]], reason: str) -> None:
    for case, title in cases:
        report.skip(case, title, reason)


def ensure_sheet(ctx: Ctx, subject_key: str, subject_id: str) -> str:
    """Return the id of the score sheet for a class-subject.

    The deployed API has no route that creates a sheet: GET
    /schools/me/responsibilities returns sheet_id=null until a row exists. This
    tries the obvious contract first (POST /schools/me/sheets), then falls back
    to a documented SQL fixture so the rest of the run is still possible.
    """
    cached = ctx.state.get(f"sheet_{subject_key}")
    if cached:
        return cached

    teacher = ctx.token("teacher_1")
    resp = signed_request("GET", "/schools/me/responsibilities", token=teacher, expect=(200,))
    for role in (resp.data or {}).get("subject_roles") or []:
        if role.get("subject_id") == subject_id and role.get("sheet_id"):
            ctx.state.set(f"sheet_{subject_key}", role["sheet_id"])
            return role["sheet_id"]

    # Forward-compatible: the route this module should expose.
    created = signed_request(
        "POST",
        "/schools/me/sheets",
        token=teacher,
        body={
            "session_id": ctx.state.get("session_id"),
            "term_id": ctx.state.get("term_id"),
            "class_id": ctx.state.get("class_id"),
            "subject_id": subject_id,
        },
        expect=(200, 201, 404, 405),
        quiet=True,
    )
    if created.status in (200, 201):
        sheet = (created.data or {}).get("sheet") or created.data or {}
        if sheet.get("id"):
            ctx.state.set(f"sheet_{subject_key}", sheet["id"])
            return sheet["id"]

    raise Blocked(
        "No score sheet exists and the API cannot create one: "
        f"GET /schools/me/responsibilities returned sheet_id=null for subject {subject_id}, "
        "POST /schools/me/sheets returned "
        f"{created.status}. Add a staff-only sheet-create route, or run the fixture below and "
        f"re-run with --set-sheet {subject_key}=<id>.\n" + sheet_fixture_sql(ctx, subject_id)
    )


def score_rows(student_ids: list[str], scores: dict) -> list[dict]:
    rows = []
    for index, student_id in enumerate(student_ids):
        ca1, ca2, ca3, exam = scores[index]
        rows.append({"student_id": student_id, "ca1": ca1, "ca2": ca2, "ca3": ca3, "exam": exam})
    return rows


def save_and_subject_sheet(ctx: Ctx, sheet_id: str, token: str, student_ids: list[str], scores: dict) -> None:
    saved = signed_request(
        "PUT", f"/schools/me/sheets/{sheet_id}/scores", token=token,
        body={"rows": score_rows(student_ids, scores)}, expect=(200,),
    )
    ctx.report.check("13s", "the second subject sheet accepts complete scores",
                     saved.status == 200 and (saved.data or {}).get("saved") == 3,
                     f"status {saved.status}: {excerpt(saved)}")
    submitted = signed_request("POST", f"/schools/me/sheets/{sheet_id}/submit", token=token, expect=(200,))
    ctx.report.check("13t", "the second subject sheet is submitted for compilation",
                     submitted.status == 200 and ((submitted.data or {}).get("sheet") or {}).get("status") == "submitted",
                     f"status {submitted.status}: {excerpt(submitted)}")


# ---------------------------------------------------------------------------
# Phase: setup (cases 1, 2, 3a, 6, 7)
# ---------------------------------------------------------------------------
def phase_setup(ctx: Ctx) -> None:
    report = ctx.report
    state = ctx.state

    # Preflight: is the deployed database actually carrying the module tables?
    # Render free instances spin down, so give a cold start three chances.
    health = http("GET", f"{API_BASE}/health", timeout=90)
    for _attempt in range(2):
        if health.status == 200:
            break
        time.sleep(15)
        health = http("GET", f"{API_BASE}/health", timeout=90)
    plans_probe = http("GET", f"{API_BASE}/schools/plans")
    if health.status != 200:
        raise Blocked(f"the API is not reachable: GET /health -> {health.status} {excerpt(health)}")
    if plans_probe.status != 200:
        raise Blocked(
            "GET /schools/plans is not healthy, so no school endpoint can work. "
            f"status {plans_probe.status}: {excerpt(plans_probe)}. "
            "The deployed Supabase project most likely does not have the module tables: run "
            "supabase/migrations/2026-11-26-school-result-compiler.sql, then reload the PostgREST "
            "schema cache (select pg_notify('pgrst', 'reload schema');)."
        )
    payments_configured, payments_detail = payments_probe()
    state.set("payments_configured", payments_configured)
    report.setup(
        f"API {API_BASE} reachable, /schools/plans healthy; payments "
        + ("CONFIGURED" if payments_configured else "NOT CONFIGURED") + f" ({payments_detail})"
    )

    admin = ctx.token("admin_a")
    admin_sub = ctx.user_id("admin_a")
    run_id = state.run_id()

    # ---------------- CASE 1: registration binds the admin ----------------
    school_name = f"PathSync Verify {run_id}"
    reg = signed_request(
        "POST", "/schools/register", token=admin,
        body={
            "name": school_name,
            "school_type": "secondary",
            "email": ctx.account("admin_a")["email"],
            "phone": "+2348000000000",
            "address": "1 Verification Way",
            "city": "Lagos",
            "state": "Lagos",
            "country": "Nigeria",
        },
        expect=(200,),
    )
    school = (reg.data or {}).get("school") or {}
    member = (reg.data or {}).get("member") or {}
    problems = []
    if reg.status != 200:
        problems.append(f"status {reg.status}: {excerpt(reg)}")
    problems += check_fields(school, {
        "id": nonempty,
        "name": school_name,
        "created_by": admin_sub,
        "status": "active",
        "slug": nonempty,
    }, "school.")
    problems += check_fields(member, {
        "role": "school_admin",
        "school_id": school.get("id"),
        "user_id": admin_sub,
        "status": "active",
    }, "member.")
    me = signed_request("GET", "/schools/me", token=admin, expect=(200,))
    problems += check_fields(me.data or {}, {"role": "school_admin", "subscription_state": "none"}, "")
    problems += check_fields((me.data or {}).get("school") or {}, {"id": school.get("id")}, "me.school.")
    duplicate = signed_request(
        "POST", "/schools/register", token=admin,
        body={"name": f"{school_name} Two", "school_type": "secondary",
              "email": ctx.account("admin_a")["email"], "country": "Nigeria"},
        expect=(409,),
    )
    if duplicate.status != 409:
        problems.append(f"second registration -> {duplicate.status} (want 409)")
    report.check("1", "registration binds the administrator to the new school", not problems, "; ".join(problems))

    if school.get("id"):
        state.set("school_id", school["id"])
        state.set("school_slug", school.get("slug"))
    state.set("admin_member_id", member.get("id"))

    # ---------------- CASE 2: plan selection ----------------
    plans_resp = signed_request("GET", "/schools/plans", expect=(200,))
    plans = (plans_resp.data or {}).get("plans") or []
    by_code = {plan.get("code"): plan for plan in plans if isinstance(plan, dict)}
    problems = []
    if plans_resp.status != 200:
        problems.append(f"status {plans_resp.status}: {excerpt(plans_resp)}")
    for code, expected in EXPECTED_PLANS.items():
        plan = by_code.get(code)
        if not plan:
            problems.append(f"missing plan {code}")
            continue
        if plan.get("max_students") != expected["max_students"]:
            problems.append(f"{code}.max_students={plan.get('max_students')!r} (want {expected['max_students']!r})")
        if "monthly_price_kobo" in expected and plan.get("monthly_price_kobo") != expected["monthly_price_kobo"]:
            problems.append(f"{code}.monthly_price_kobo={plan.get('monthly_price_kobo')!r}")
        if not is_number(plan.get("monthly_price_kobo")) or plan["monthly_price_kobo"] <= 0:
            problems.append(f"{code}.monthly_price_kobo is not a positive integer")
        if plan.get("currency") != "NGN":
            problems.append(f"{code}.currency={plan.get('currency')!r}")
    report.check("2a", "the five seeded plans are published with their capacities and kobo prices",
                 not problems, "; ".join(problems))

    basic = by_code.get("basic") or {}
    payments_ok = bool(state.get("payments_configured"))

    # The pending subscription and its payment row are written before the API
    # needs the provider, so plan selection and price integrity are provable even
    # on a deployment that has no Paystack credentials.
    def pending_subscription() -> tuple[dict, list]:
        detail = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
        data = detail.data or {}
        return data.get("subscription") or {}, data.get("payments") or []

    def check_pending_subscription(cycle: str, amount: int) -> list[str]:
        subscription, payments = pending_subscription()
        problems = check_fields(subscription, {
            "status": "pending",
            "plan_id": basic.get("id"),
            "billing_cycle": cycle,
            "amount_kobo": amount,
            "student_capacity": 100,
            "currency": "NGN",
        }, "subscription.")
        if len(payments) != 1:
            problems.append(f"payments={len(payments)} (want 1 pending payment)")
        else:
            problems += check_fields(payments[0], {
                "status": "pending", "amount_kobo": amount, "currency": "NGN", "reference": nonempty,
            }, "payment.")
        if subscription.get("paystack_reference"):
            state.set("reference", subscription["paystack_reference"])
        return problems

    checkout = signed_request(
        "POST", "/schools/me/subscription/checkout", token=admin,
        body={"plan_code": "basic", "billing_cycle": "monthly"}, expect=(200, 503),
    )
    problems = []
    if checkout.status == 200:
        subscription = (checkout.data or {}).get("subscription") or {}
        problems += check_fields(checkout.data or {}, {
            "reference": nonempty,
            "authorization_url": lambda v: isinstance(v, str) and v.startswith("https://"),
        }, "")
        problems += check_fields(subscription, {
            "status": "pending",
            "plan_id": basic.get("id"),
            "billing_cycle": "monthly",
            "amount_kobo": 2_500_000,
            "student_capacity": 100,
        }, "subscription.")
        if checkout.data.get("reference"):
            state.set("reference", checkout.data["reference"])
            state.set("authorization_url", checkout.data.get("authorization_url"))
        report.check("2b", "a plan can be selected and a pending subscription created at its price",
                     not problems, "; ".join(problems))
        report.check("2c", "checkout hands back a Paystack authorization url", True)
    elif checkout.status == 503:
        # No PAYSTACK_SECRET_KEY on this deployment: the intent is still recorded.
        problems += check_pending_subscription("monthly", 2_500_000)
        report.check("2b", "a plan can be selected and a pending subscription recorded at the seeded price",
                     not problems, "; ".join(problems))
        report.skip(
            "2c", "checkout hands back a Paystack authorization url",
            "NOT COVERED: the deployed API answers 503 (Payments are not configured) because "
            "PAYSTACK_SECRET_KEY is not set on Render, so no payment can be started. "
            "Set that variable, redeploy, then re-run --phase setup.",
        )
    else:
        report.check("2b", "a plan can be selected and a pending subscription recorded at the seeded price",
                     False, f"checkout -> {checkout.status}: {excerpt(checkout)}")
        report.skip("2c", "checkout hands back a Paystack authorization url", "checkout did not succeed")

    # Price integrity: the amount comes from the plan row, never from the client.
    if state.get("reference") or payments_ok:
        annual = by_code.get("basic", {}).get("annual_price_kobo")
        annual_checkout = signed_request(
            "POST", "/schools/me/subscription/checkout", token=admin,
            body={"plan_code": "basic", "billing_cycle": "annual"}, expect=(200, 503),
        )
        problems = []
        if annual_checkout.status in (200, 503) and is_number(annual):
            problems += check_pending_subscription("annual", int(annual))
        else:
            problems.append(f"annual checkout -> {annual_checkout.status}")
        unknown = signed_request(
            "POST", "/schools/me/subscription/checkout", token=admin,
            body={"plan_code": "no-such-plan", "billing_cycle": "monthly"}, expect=(404,),
        )
        if unknown.status != 404:
            problems.append(f"unknown plan -> {unknown.status} (want 404)")
        report.check("2d", "the price charged is the plan's own, and an unknown plan is refused",
                     not problems, "; ".join(problems))
        # Put the monthly intent back so the rest of the run describes one plan.
        signed_request(
            "POST", "/schools/me/subscription/checkout", token=admin,
            body={"plan_code": "basic", "billing_cycle": "monthly"}, expect=(200, 503),
        )
    else:
        report.skip("2d", "the price charged is the plan's own, and an unknown plan is refused",
                    "no pending subscription was recorded")

    # ---------------- CASE 3a: checkout alone does not activate ----------------
    problems = []
    if state.get("reference"):
        pending = signed_request("GET", "/schools/me", token=admin, expect=(200,))
        problems += check_fields(pending.data or {}, {"subscription_state": "pending"}, "")
        problems += check_fields((pending.data or {}).get("subscription") or {}, {"status": "pending"}, "subscription.")

        bogus = signed_request(
            "POST", "/schools/me/subscription/verify", token=admin,
            query={"reference": f"verify_bogus_{run_id}"}, expect=(404,),
        )
        if bogus.status != 404:
            problems.append(f"unknown reference -> {bogus.status} (want 404)")

        unpaid = signed_request(
            "POST", "/schools/me/subscription/verify", token=admin,
            query={"reference": state.get("reference")}, expect=(200, 402, 503),
        )
        if unpaid.status == 200:
            report.skip("3a", "an unverified checkout does not activate a subscription",
                        "the checkout is already paid and verified; this half cannot be replayed")
            problems = []
        elif unpaid.status not in (402, 503):
            problems.append(f"verify before payment -> {unpaid.status} (want 402): {excerpt(unpaid)}")
        else:
            still = signed_request("GET", "/schools/me", token=admin, expect=(200,))
            problems += check_fields(still.data or {}, {"subscription_state": "pending"}, "after-verify.")
            invoices = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
            problems += check_fields(invoices.data or {}, {"state": "pending", "invoices": lambda v: v == []}, "")
            _, payments = pending_subscription()
            if [p.get("status") for p in payments] != ["pending"]:
                problems.append(f"payment statuses={[p.get('status') for p in payments]} (want one pending)")
        note = "" if unpaid.status == 402 else " (the provider call answered 503: no Paystack key on the API)"
        report.check("3a", "an unverified checkout does not activate a subscription", not problems,
                     "; ".join(problems) + note)
    else:
        if not any(case == "3a" for _status, case, *_ in report.records):
            report.skip("3a", "an unverified checkout does not activate a subscription",
                        "checkout did not record a reference")

    # ---------------- Structure (no case number) ----------------
    session = signed_request(
        "POST", "/schools/me/sessions", token=admin,
        body={"name": f"2026/2027 {run_id}", "starts_on": "2026-09-01", "ends_on": "2027-07-31", "is_current": True},
        expect=(200,),
    )
    session_row = (session.data or {}).get("session") or {}
    state.set("session_id", session_row.get("id"))
    term = signed_request(
        "POST", "/schools/me/terms", token=admin,
        body={"session_id": session_row.get("id"), "name": "First Term", "position": 1,
              "starts_on": "2026-09-01", "ends_on": "2026-12-15", "is_current": True},
        expect=(200,),
    )
    term_row = (term.data or {}).get("term") or {}
    state.set("term_id", term_row.get("id"))
    klass = signed_request("POST", "/schools/me/classes", token=admin, body={"name": "JSS 1A", "level": "JSS1"}, expect=(200,))
    class_row = (klass.data or {}).get("class") or {}
    state.set("class_id", class_row.get("id"))
    subjects = {}
    for key, name, code in (("subject1", "Mathematics", "MTH"), ("subject2", "English Language", "ENG")):
        subject = signed_request("POST", "/schools/me/subjects", token=admin, body={"name": name, "code": code}, expect=(200,))
        row = (subject.data or {}).get("subject") or {}
        subjects[key] = row.get("id")
        state.set(f"{key}_id", row.get("id"))
    links = []
    for key in ("subject1", "subject2"):
        link = signed_request(
            "POST", "/schools/me/class-subjects", token=admin,
            body={"session_id": state.get("session_id"), "class_id": state.get("class_id"), "subject_id": subjects[key]},
            expect=(200,),
        )
        links.append(link)
    structure_ok = (
        session.status == 200 and term.status == 200 and klass.status == 200
        and all(links) and all((link.data or {}).get("created") is True for link in links)
        and class_row.get("school_id") == state.get("school_id")
        and session_row.get("is_current") is True and term_row.get("is_current") is True
    )
    report.check(
        "5a", "the academic structure is created (session, term, class, subjects)",
        structure_ok,
        f"session={session.status} term={term.status} class={klass.status} links={[link.status for link in links]}",
    )

    # ---------------- CASE 6: teacher invite and activation ----------------
    teacher_account = ctx.account("teacher_1")
    invite = signed_request(
        "POST", "/schools/me/teachers/invite", token=admin,
        body={"email": teacher_account["email"], "full_name": "Verify Teacher One"}, expect=(200,),
    )
    invited = (invite.data or {}).get("member") or {}
    code = (invite.data or {}).get("invite_code")
    problems = []
    problems += check_fields(invite.data or {}, {"invite_code": nonempty, "resent": False}, "")
    problems += check_fields(invited, {
        "role": "teacher",
        "status": "invited",
        "school_id": state.get("school_id"),
        "invited_email": teacher_account["email"],
    }, "member.")
    teacher = ctx.token("teacher_1")
    joined = signed_request("POST", "/schools/me/join", token=teacher, body={"invite_code": code}, expect=(200,))
    problems += check_fields(joined.data or {}, {
        "role": "teacher",
        "school_id": state.get("school_id"),
    }, "")
    problems += check_fields((joined.data or {}).get("member") or {}, {
        "status": "active",
        "user_id": ctx.user_id("teacher_1"),
    }, "member.")
    teacher_me = signed_request("GET", "/schools/me", token=teacher, expect=(200,))
    problems += check_fields(teacher_me.data or {}, {"role": "teacher"}, "")
    replay = signed_request("POST", "/schools/me/join", token=teacher, body={"invite_code": code}, expect=(409,))
    if replay.status != 409:
        problems.append(f"reused code -> {replay.status} (want 409)")

    # Second teacher, activated, deliberately with no assignments (case 8).
    teacher2_account = ctx.account("teacher_2")
    invite2 = signed_request(
        "POST", "/schools/me/teachers/invite", token=admin,
        body={"email": teacher2_account["email"], "full_name": "Verify Teacher Two"}, expect=(200,),
    )
    teacher2 = ctx.token("teacher_2")
    joined2 = signed_request(
        "POST", "/schools/me/join", token=teacher2,
        body={"invite_code": (invite2.data or {}).get("invite_code")}, expect=(200,),
    )
    problems += check_fields(joined2.data or {}, {"role": "teacher", "school_id": state.get("school_id")}, "teacher2.")

    # Email binding: a code issued to another address must be refused.
    other = signed_request(
        "POST", "/schools/me/teachers/invite", token=admin,
        body={"email": f"pathsync-verify-{run_id}-not-teacher2@{EMAIL_DOMAIN}"}, expect=(200,),
    )
    wrong = signed_request(
        "POST", "/schools/me/join", token=teacher2,
        body={"invite_code": (other.data or {}).get("invite_code")}, expect=(403,),
    )
    if wrong.status != 403:
        problems.append(f"wrong-email join -> {wrong.status} (want 403)")

    teachers = signed_request("GET", "/schools/me/teachers", token=admin, expect=(200,))
    active_emails = {
        row.get("invited_email")
        for row in ((teachers.data or {}).get("teachers") or [])
        if row.get("status") == "active"
    }
    if teacher_account["email"] not in active_emails:
        problems.append("teacher 1 is not listed as active")
    report.check("6", "the invited teacher activates with the code, once and only for their email", not problems, "; ".join(problems))
    state.set("teacher_member_id", (joined.data or {}).get("member", {}).get("id"))

    # ---------------- CASE 7: two responsibilities at once ----------------
    require(ctx, "session_id", "class_id", "subject1_id", "subject2_id", "teacher_member_id")
    problems = []
    created_assignments = []
    for kind, subject in (("subject", state.get("subject1_id")), ("subject", state.get("subject2_id")), ("form", None)):
        body = {
            "session_id": state.get("session_id"),
            "member_id": state.get("teacher_member_id"),
            "class_id": state.get("class_id"),
            "kind": kind,
        }
        if subject:
            body["subject_id"] = subject
        resp = signed_request("POST", "/schools/me/assignments", token=admin, body=body, expect=(200,))
        created_assignments.append(resp)
        row = (resp.data or {}).get("assignment") or {}
        if resp.status != 200:
            problems.append(f"{kind} assignment -> {resp.status}: {excerpt(resp)}")
        elif row.get("kind") != kind or row.get("class_id") != state.get("class_id"):
            problems.append(f"{kind} assignment returned {row!r}")
        elif kind == "subject" and row.get("subject_id") != subject:
            problems.append(f"subject assignment subject_id={row.get('subject_id')!r}")
        elif kind == "form" and row.get("subject_id") is not None:
            problems.append("form assignment carried a subject_id")
    invalid = signed_request(
        "POST", "/schools/me/assignments", token=admin,
        body={"session_id": state.get("session_id"), "member_id": state.get("teacher_member_id"),
              "class_id": state.get("class_id"), "kind": "form", "subject_id": state.get("subject1_id")},
        expect=(422,),
    )
    if invalid.status != 422:
        problems.append(f"form assignment with subject -> {invalid.status} (want 422)")

    responsibilities = signed_request("GET", "/schools/me/responsibilities", token=teacher, expect=(200,))
    data = responsibilities.data or {}
    subject_roles = data.get("subject_roles") or []
    form_roles = data.get("form_roles") or []
    subject_ids = {role.get("subject_id") for role in subject_roles}
    if len(subject_roles) != 2 or subject_ids != {state.get("subject1_id"), state.get("subject2_id")}:
        problems.append(f"subject_roles={[(r.get('subject_id'), r.get('class_id')) for r in subject_roles]}")
    if len(form_roles) != 1 or form_roles[0].get("class_id") != state.get("class_id"):
        problems.append(f"form_roles={[(r.get('class_id'), r.get('kind')) for r in form_roles]}")
    problems += check_fields(data, {"session": lambda v: isinstance(v, dict) and v.get("id") == state.get("session_id"),
                                    "term": lambda v: isinstance(v, dict) and v.get("id") == state.get("term_id")}, "")
    report.check("7", "one teacher holds subject and form-teacher responsibilities at once", not problems, "; ".join(problems))


# ---------------------------------------------------------------------------
# Phase: pay (case 3b)
# ---------------------------------------------------------------------------
def phase_pay(ctx: Ctx) -> bool:
    report = ctx.report
    state = ctx.state
    require(ctx, "reference", "school_id")
    admin = ctx.token("admin_a")

    if not state.get("payments_configured"):
        report.skip(
            "3b", "a verified payment activates the subscription exactly once",
            "NOT COVERED: the deployed API has no PAYSTACK_SECRET_KEY, so /schools/me/subscription/verify "
            "and /webhooks/paystack both answer 503 and no payment can be confirmed. Manual step: set "
            "PAYSTACK_SECRET_KEY (test key) on the Render service, redeploy, then re-run "
            "--phase setup, pay the printed authorization_url, and re-run --phase pay.",
        )
        return False

    verified = signed_request(
        "POST", "/schools/me/subscription/verify", token=admin,
        query={"reference": ctx.state.get("reference")}, expect=(200, 402, 404),
    )
    if verified.status == 402:
        report.skip(
            "3b", "a verified payment activates the subscription",
            f"Paystack has not confirmed the payment. Open {ctx.state.get('authorization_url')} "
            "and pay with the Paystack test card (4078 7500 0000 0001, any future expiry, CVV 408), "
            "then re-run --phase pay.",
        )
        return False
    if verified.status == 404:
        report.check("3b", "a verified payment activates the subscription", False,
                     f"verify -> 404 for reference {ctx.state.get('reference')}")
        return False

    subscription = (verified.data or {}).get("subscription") or {}
    payment = (verified.data or {}).get("payment") or {}
    problems = []
    problems += check_fields(verified.data or {}, {"state": "active"}, "")
    problems += check_fields(subscription, {"status": "active"}, "subscription.")
    problems += check_fields(payment, {"status": "success", "reference": ctx.state.get("reference")}, "payment.")
    period_end = subscription.get("current_period_end")
    if not period_end:
        problems.append("subscription.current_period_end is missing")
    else:
        try:
            if datetime.fromisoformat(str(period_end).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                problems.append(f"current_period_end={period_end} is not in the future")
        except ValueError:
            problems.append(f"current_period_end={period_end!r} is not a timestamp")

    me = signed_request("GET", "/schools/me", token=admin, expect=(200,))
    problems += check_fields(me.data or {}, {"subscription_state": "active"}, "")
    problems += check_fields((me.data or {}).get("plan") or {}, {"code": "basic"}, "plan.")
    students_block = (me.data or {}).get("students") or {}
    used_now = int(students_block.get("used") or 0)
    problems += check_fields(students_block, {
        "capacity": 100,
        "used": is_number,
        "remaining": lambda v, used=used_now: is_number(v) and int(v) == 100 - used,
    }, "students.")

    detail = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
    invoices = (detail.data or {}).get("invoices") or []
    payments = (detail.data or {}).get("payments") or []
    if len(invoices) != 1:
        problems.append(f"invoices={len(invoices)} (want 1)")
    elif invoices[0].get("status") != "paid" or invoices[0].get("amount_kobo") != 2_500_000:
        problems.append(f"invoice={invoices[0].get('status')}/{invoices[0].get('amount_kobo')}")
    if len(payments) != 1:
        problems.append(f"payments={len(payments)} (want 1)")

    again = signed_request(
        "POST", "/schools/me/subscription/verify", token=admin,
        query={"reference": ctx.state.get("reference")}, expect=(200,),
    )
    if again.status != 200 or not (again.data or {}).get("already"):
        problems.append(f"second verify -> {again.status}, already={((again.data or {}).get('already'))!r}")
    after = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
    if len(((after.data or {}).get("invoices") or [])) != 1:
        problems.append("re-verifying created a second invoice")

    report.check("3b", "a verified payment activates the subscription exactly once", not problems, "; ".join(problems))
    return verified.status == 200


# ---------------------------------------------------------------------------
# Phase: teach (cases 5, 4, 8, 9, 10, 11, 12)
# ---------------------------------------------------------------------------
NO_PLAN_REASON = (
    "NOT COVERED: the test school's subscription is {state!r}, so the API refuses student registration "
    "and every score operation with 402. That gate is itself verified below (case 4g). Once a "
    "PAYSTACK_SECRET_KEY is configured and --phase pay succeeds, this case runs unchanged."
)


def teach_without_subscription(ctx: Ctx, subscription_state: str) -> None:
    """Report what a school without a live plan can and cannot do.

    The compiler is deliberately closed without a subscription, so the cases that
    need students, sheets or a compilation cannot run. Rather than turning that
    into a wall of FAILs, the gate is verified and the rest is recorded as not
    covered.
    """
    report = ctx.report
    state = ctx.state
    admin = ctx.token("admin_a")
    teacher = ctx.token("teacher_1")
    run_id = state.run_id()
    reason = NO_PLAN_REASON.format(state=subscription_state)

    # Case 4g: reads stay open, premium writes are refused with a readable 402.
    problems = []
    for label, path in (("students", "/schools/me/students"), ("subjects", "/schools/me/subjects"),
                        ("classes", "/schools/me/classes"), ("school", "/schools/me")):
        resp = signed_request("GET", path, token=admin, expect=(200,))
        if resp.status != 200:
            problems.append(f"GET {path} -> {resp.status} (want 200)")
    blocked = signed_request(
        "POST", "/schools/me/students", token=admin,
        body={"admission_no": f"PV-{run_id}-GATE", "first_name": "Gate", "last_name": "Check",
              "session_id": state.get("session_id")},
        expect=(402,),
    )
    if blocked.status != 402:
        problems.append(f"student create without a live plan -> {blocked.status} (want 402)")
    elif not detail_text(blocked):
        problems.append("the 402 carries no readable detail")
    report.check("4g", "reads stay open and premium writes are refused while the plan is not live",
                 not problems, "; ".join(problems))

    # Case 8s: the score-sheet route exists and is gated, not missing.
    problems = []
    created = signed_request(
        "POST", "/schools/me/sheets", token=teacher,
        body={"session_id": state.get("session_id"), "term_id": state.get("term_id"),
              "class_id": state.get("class_id"), "subject_id": state.get("subject1_id")},
        expect=(402,),
    )
    if created.status == 402:
        pass
    elif created.status in (404, 405):
        problems.append(f"POST /schools/me/sheets -> {created.status}: the API cannot open a score sheet at all")
    else:
        problems.append(f"POST /schools/me/sheets -> {created.status} (want 402 while unsubscribed): {excerpt(created)}")
    student_token = None
    try:
        student_token = ctx.token("student_a")
    except (Blocked, AuthError):
        student_token = None
    if student_token:
        refused = signed_request(
            "POST", "/schools/me/sheets", token=student_token,
            body={"session_id": state.get("session_id"), "term_id": state.get("term_id"),
                  "class_id": state.get("class_id"), "subject_id": state.get("subject1_id")},
            expect=(403,),
        )
        if refused.status != 403:
            problems.append(f"student opening a sheet -> {refused.status} (want 403)")
    report.check("8s", "the score-sheet route exists and only staff can open one", not problems, "; ".join(problems))

    for case, title in (
        ("4", "capacity blocks student registration beyond the plan limit"),
        ("4b", "one free slot admits exactly one concurrent student"),
        ("5", "the admin creates a class and enrols students"),
        ("5b", "the student accounts activate and hold the student role"),
        ("8", "a teacher outside the assignment cannot read or write a sheet"),
        ("9", "scores above the configured maximum are rejected and the maximum itself accepted"),
        ("10", "submitting with a missing score is rejected"),
        ("11", "submitting after every student is complete succeeds"),
        ("12", "a second submit and any edit after submit are refused"),
    ):
        report.skip(case, title, reason)


def phase_teach(ctx: Ctx) -> None:
    report = ctx.report
    state = ctx.state
    require(ctx, "school_id", "session_id", "term_id", "class_id", "subject1_id", "subject2_id")
    admin = ctx.token("admin_a")
    teacher = ctx.token("teacher_1")
    run_id = state.run_id()

    me = signed_request("GET", "/schools/me", token=admin, expect=(200,))
    live_state = (me.data or {}).get("subscription_state")
    if live_state != "active":
        teach_without_subscription(ctx, str(live_state))
        return

    # ---------------- CASE 5: class and students ----------------
    problems = []
    students = []
    student_emails = {
        0: ctx.account("student_a")["email"],
        3: ctx.account("student_c")["email"],
    }
    for index in range(4):
        body = {
            "admission_no": f"PV-{run_id}-{index + 1:03d}",
            "first_name": f"Verify{index + 1}",
            "last_name": "Pupil",
            "guardian_name": "Verify Guardian",
            "guardian_phone": "+2348000000001",
            "guardian_email": student_emails.get(index, ""),
            "session_id": state.get("session_id"),
        }
        if index < 3:  # three are enrolled in JSS 1A, the fourth stays outside the class
            body["class_id"] = state.get("class_id")
        resp = signed_request("POST", "/schools/me/students", token=admin, body=body, expect=(200,))
        row = (resp.data or {}).get("student") or {}
        students.append(row)
        if resp.status != 200:
            problems.append(f"student {index + 1} -> {resp.status}: {excerpt(resp)}")
            continue
        problems += check_fields(row, {
            "id": nonempty,
            "school_id": state.get("school_id"),
            "admission_no": body["admission_no"],
            "name": f"Verify{index + 1} Pupil",
            "invite_code": nonempty,
            "status": "active",
        }, f"student{index + 1}.")
    state.set("student_ids", [row.get("id") for row in students[:3]])
    state.set("student_c_id", (students[3] or {}).get("id") if len(students) > 3 else None)
    if len(students) >= 4:
        state.set("student_a_id", students[0].get("id"))
        state.set("student_a_invite", students[0].get("invite_code"))
        state.set("student_c_invite", students[3].get("invite_code"))

    roster = signed_request("GET", "/schools/me/students", token=admin, query={"class_id": state.get("class_id")}, expect=(200,))
    roster_rows = (roster.data or {}).get("students") or []
    if len(roster_rows) != 3:
        problems.append(f"class roster has {len(roster_rows)} students (want 3)")
    for row in roster_rows:
        if row.get("class_id") != state.get("class_id") or row.get("class_name") != "JSS 1A":
            problems.append(f"roster row class={row.get('class_id')}/{row.get('class_name')}")
            break

    # Only an administrator may add students.
    forbidden = signed_request(
        "POST", "/schools/me/students", token=teacher,
        body={"admission_no": f"PV-{run_id}-X", "first_name": "No", "last_name": "Access",
              "class_id": state.get("class_id"), "session_id": state.get("session_id")},
        expect=(403,),
    )
    if forbidden.status != 403:
        problems.append(f"teacher creating a student -> {forbidden.status} (want 403)")
    report.check("5", "the admin creates a class and enrols students", not problems, "; ".join(problems))

    # Student accounts: the guardian email on the record must match the sign-in.
    problems = []
    for key, invite_key in (("student_a", "student_a_invite"), ("student_c", "student_c_invite")):
        if not state.get(invite_key):
            problems.append(f"{key} has no invite code")
            continue
        token = ctx.token(key)
        signed_request("POST", "/schools/me/join", token=token,
                       body={"invite_code": state.get(invite_key)}, expect=(200, 409))
        who = signed_request("GET", "/schools/me", token=token, expect=(200, 403))
        role = (who.data or {}).get("role")
        if who.status != 200 or role != "student":
            problems.append(f"{key} role={role!r} status={who.status}")
    report.check("5b", "the student accounts activate and hold the student role", not problems, "; ".join(problems))

    if not state.get("student_ids") or any(not value for value in state.get("student_ids") or []):
        for case in ("4", "8", "9", "10", "11", "12"):
            report.block(case, "case needs the three enrolled students", "student creation failed (see case 5)")
        return

    # ---------------- CASE 4: capacity ----------------
    me = signed_request("GET", "/schools/me", token=admin, expect=(200,))
    students_block = (me.data or {}).get("students") or {}
    capacity = int(students_block.get("capacity") or 0)
    used = int(students_block.get("used") or 0)
    problems = []
    if capacity != 100:
        problems.append(f"capacity={capacity} (want the basic plan's 100)")
    if capacity > DEFAULT_CAPACITY_FILL_LIMIT:
        report.block("4", "capacity blocks students beyond the plan limit",
                     f"plan capacity is {capacity}; this run will not create that many students. "
                     f"Raise DEFAULT_CAPACITY_FILL_LIMIT or shrink the plan's max_students.")
    else:
        filled = used
        target = capacity - 1  # leave exactly one slot for the concurrency probe
        while filled < target:
            body = {
                "admission_no": f"PV-{run_id}-F{filled:04d}",
                "first_name": "Capacity",
                "last_name": f"Fill{filled:04d}",
                "session_id": state.get("session_id"),
            }
            resp = signed_request("POST", "/schools/me/students", token=admin, body=body, expect=(200, 409), quiet=True)
            if resp.status != 200:
                problems.append(f"fill at {filled}/{target} -> {resp.status}: {excerpt(resp, 200)}")
                break
            filled += 1
            if filled % 10 == 0:
                print(f"      ... {filled}/{target} students created", flush=True)
        if not problems:
            # 4b: advisory concurrency probe, one slot left.
            outcomes: list[int] = []
            lock = threading.Lock()

            def attempt(index: int):
                resp = signed_request(
                    "POST", "/schools/me/students", token=admin,
                    body={"admission_no": f"PV-{run_id}-R{index}", "first_name": "Race",
                          "last_name": f"Probe{index}", "session_id": state.get("session_id")},
                    expect=(200, 409), quiet=True,
                )
                with lock:
                    outcomes.append(resp.status)

            threads = [threading.Thread(target=attempt, args=(index,)) for index in range(4)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            successes = outcomes.count(200)
            if successes == 1 and outcomes.count(409) == 3:
                report.check("4b", "one free slot admits exactly one concurrent student", True)
            else:
                report.warn(
                    "4b", "one free slot admits exactly one concurrent student",
                    f"4 parallel creates -> {outcomes}. More than one success means the capacity check is "
                    "read-then-insert and can overshoot under load; case 4 (sequential) is the acceptance criterion.",
                )
            over = signed_request(
                "POST", "/schools/me/students", token=admin,
                body={"admission_no": f"PV-{run_id}-OVER", "first_name": "Over", "last_name": "Limit",
                      "session_id": state.get("session_id")},
                expect=(409,),
            )
            if over.status != 409:
                problems.append(f"create beyond capacity -> {over.status} (want 409)")
            detail = detail_of(over)
            if not isinstance(detail, dict):
                problems.append(f"409 detail is {type(detail).__name__}, want an object with needs_upgrade")
            else:
                problems += check_fields(detail, {
                    "needs_upgrade": True,
                    "capacity": capacity,
                    "used": lambda v: is_number(v) and int(v) >= capacity,
                }, "detail.")
            final = signed_request("GET", "/schools/me", token=admin, expect=(200,))
            problems += check_fields((final.data or {}).get("students") or {}, {
                "used": capacity, "capacity": capacity, "remaining": 0,
            }, "students.")
        report.check("4", "capacity blocks student registration beyond the plan limit", not problems, "; ".join(problems))

    # ---------------- CASE 8: unassigned teacher cannot read a sheet ----------------
    try:
        sheet1 = ensure_sheet(ctx, "subject1", state.get("subject1_id"))
    except Blocked as exc:
        report.block("8", "a teacher outside the assignment cannot read a sheet", str(exc))
        report.block("9", "scores above the configured maximum are rejected", "no score sheet (see case 8)")
        report.block("10", "submitting with a missing score is rejected", "no score sheet (see case 8)")
        report.block("11", "submitting after every student is complete succeeds", "no score sheet (see case 8)")
        report.block("12", "a second submit is refused", "no score sheet (see case 8)")
        return
    state.set("sheet1_id", sheet1)

    teacher2 = ctx.token("teacher_2")
    problems = []
    peek = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher2, expect=(403,))
    if peek.status != 403:
        problems.append(f"unassigned GET sheet -> {peek.status} (want 403)")
    write = signed_request(
        "PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher2,
        body={"rows": [{"student_id": state.get("student_ids")[0], "ca1": 1, "ca2": 1, "ca3": 1, "exam": 1}]},
        expect=(403,),
    )
    if write.status != 403:
        problems.append(f"unassigned PUT scores -> {write.status} (want 403)")
    empty = signed_request("GET", "/schools/me/responsibilities", token=teacher2, expect=(200,))
    if (empty.data or {}).get("subject_roles") or (empty.data or {}).get("form_roles"):
        problems.append("unassigned teacher has responsibilities")
    report.check("8", "a teacher outside the assignment cannot read or write a sheet", not problems, "; ".join(problems))

    # ---------------- CASE 9: maxima ----------------
    sheet = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    data = sheet.data or {}
    config = data.get("config") or {}
    problems = []
    problems += check_fields(config, {"ca1_max": near(10), "ca2_max": near(10), "ca3_max": near(10), "exam_max": near(70),
                                      "total_max": near(100)}, "config.")
    problems += check_fields(data.get("sheet") or {}, {"status": "draft"}, "sheet.")
    if len(data.get("students") or []) != 3:
        problems.append(f"sheet has {len(data.get('students') or [])} students (want 3)")
    if data.get("locked") is not False or data.get("missing") != 3:
        problems.append(f"locked={data.get('locked')!r} missing={data.get('missing')!r}")

    first = state.get("student_ids")[0]
    invalid_cases = [
        ("ca1 above maximum", {"ca1": 11, "ca2": 1, "ca3": 1, "exam": 1}),
        ("exam above maximum", {"ca1": 1, "ca2": 1, "ca3": 1, "exam": 71}),
        ("negative score", {"ca1": -1, "ca2": 1, "ca3": 1, "exam": 1}),
    ]
    for label, scores in invalid_cases:
        resp = signed_request(
            "PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher,
            body={"rows": [{"student_id": first, **scores}]}, expect=(422,),
        )
        if resp.status != 422:
            problems.append(f"{label} -> {resp.status} (want 422)")
        detail = detail_of(resp)
        if not isinstance(detail, dict) or not detail.get("problems"):
            problems.append(f"{label} 422 detail has no problems list ({detail_text(resp)})")
    untouched = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    first_row = next((row for row in (untouched.data or {}).get("students") or [] if row.get("student_id") == first), {})
    if first_row.get("ca1") is not None:
        problems.append("a rejected score was persisted")
    boundary = signed_request(
        "PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher,
        body={"rows": [{"student_id": first, "ca1": 10, "ca2": 10, "ca3": 10, "exam": 70}]}, expect=(200,),
    )
    if boundary.status != 200:
        problems.append(f"exact maximum -> {boundary.status} (want 200)")
    else:
        check = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
        row = next((item for item in (check.data or {}).get("students") or [] if item.get("student_id") == first), {})
        problems += check_fields(row, {"total": near(100), "grade": "A1", "complete": True}, "boundary.")
    report.check("9", "scores above the configured maximum are rejected and the maximum itself accepted", not problems, "; ".join(problems))

    # ---------------- CASE 10: incomplete submit ----------------
    ids = state.get("student_ids") or []
    partial = [{"student_id": ids[0], **dict(zip(("ca1", "ca2", "ca3", "exam"), SUBJECT_1_SCORES[0]))},
               {"student_id": ids[1], **dict(zip(("ca1", "ca2", "ca3", "exam"), SUBJECT_1_SCORES[1]))}]
    saved = signed_request("PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher, body={"rows": partial}, expect=(200,))
    problems = []
    if (saved.data or {}).get("saved") != 2:
        problems.append(f"saved={((saved.data or {}).get('saved'))!r} (want 2)")
    submit = signed_request("POST", f"/schools/me/sheets/{sheet1}/submit", token=teacher, expect=(409,))
    if submit.status != 409:
        problems.append(f"submit with a missing score -> {submit.status} (want 409)")
    detail = detail_of(submit)
    if not isinstance(detail, dict) or not detail.get("missing"):
        problems.append(f"409 detail has no missing list ({detail_text(submit)})")
    elif "Verify3 Pupil" not in " ".join(detail["missing"]):
        problems.append(f"missing list {detail['missing']} does not name Verify3 Pupil")
    after = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    if after.data.get("missing") != 1 or after.data.get("locked") is not False:
        problems.append(f"after refused submit: missing={after.data.get('missing')!r} locked={after.data.get('locked')!r}")
    report.check("10", "submitting with a missing score is rejected", not problems, "; ".join(problems))

    # ---------------- CASE 11: complete submit ----------------
    problems = []
    third = [{"student_id": ids[2], **dict(zip(("ca1", "ca2", "ca3", "exam"), SUBJECT_1_SCORES[2]))}]
    filled = signed_request("PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher, body={"rows": third}, expect=(200,))
    if (filled.data or {}).get("saved") != 1:
        problems.append(f"last row saved={((filled.data or {}).get('saved'))!r}")
    check = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    totals = {row.get("student_id"): row.get("total") for row in (check.data or {}).get("students") or []}
    if check.data.get("missing") != 0:
        problems.append(f"missing={check.data.get('missing')!r} after all rows")
    for index, student_id in enumerate(ids):
        if not near(87 if index == 0 else 76 if index == 1 else 52)(totals.get(student_id)):
            problems.append(f"student{index + 1} total={totals.get(student_id)!r}")
    submitted = signed_request("POST", f"/schools/me/sheets/{sheet1}/submit", token=teacher, expect=(200,))
    sheet_row = (submitted.data or {}).get("sheet") or {}
    problems += check_fields(sheet_row, {"status": "submitted", "submitted_at": nonempty}, "sheet.")
    locked = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    if (locked.data or {}).get("locked") is not True:
        problems.append("sheet does not report locked after submit")
    report.check("11", "submitting after every student is complete succeeds", not problems, "; ".join(problems))

    # ---------------- CASE 12: second submit ----------------
    problems = []
    again = signed_request("POST", f"/schools/me/sheets/{sheet1}/submit", token=teacher, expect=(409,))
    if again.status != 409:
        problems.append(f"second submit -> {again.status} (want 409)")
    elif "locked" not in detail_text(again).lower():
        problems.append(f"409 does not mention the lock: {detail_text(again)}")
    edit = signed_request(
        "PUT", f"/schools/me/sheets/{sheet1}/scores", token=teacher,
        body={"rows": [{"student_id": ids[0], "ca1": 1, "ca2": 1, "ca3": 1, "exam": 1}]}, expect=(409,),
    )
    if edit.status != 409:
        problems.append(f"edit after submit -> {edit.status} (want 409)")
    unchanged = signed_request("GET", f"/schools/me/sheets/{sheet1}", token=teacher, expect=(200,))
    row = next((item for item in (unchanged.data or {}).get("students") or [] if item.get("student_id") == ids[0]), {})
    if row.get("ca1") != 10 or row.get("total") != 87:
        problems.append(f"stored row changed after a refused edit: ca1={row.get('ca1')!r} total={row.get('total')!r}")
    report.check("12", "a second submit and any edit after submit are refused", not problems, "; ".join(problems))

    # ---------------- Setup: second subject sheet, needed for compilation ----------------
    try:
        sheet2 = ensure_sheet(ctx, "subject2", state.get("subject2_id"))
    except Blocked as exc:
        report.block("13", "compile produces totals and positions", str(exc))
        report.block("14", "approve then publish works and a further compile is refused", "no second subject sheet")
        return
    state.set("sheet2_id", sheet2)
    save_and_subject_sheet(ctx, sheet2, teacher, ids, SUBJECT_2_SCORES)


# ---------------------------------------------------------------------------
# Phase: compile (cases 13, 14)
# ---------------------------------------------------------------------------
def phase_compile(ctx: Ctx) -> None:
    report = ctx.report
    state = ctx.state
    if not all(state.get(k) for k in ("class_id", "session_id", "term_id", "sheet1_id", "sheet2_id", "student_ids")):
        skip_phase(report, [
            ("13", "compile produces the correct totals, grades, averages and positions"),
            ("13b", "the form teacher submits the compiled class to the administrator"),
            ("14", "approve then publish works, the result locks, and the audit trail records it"),
        ], "NOT COVERED: compilation needs enrolled students and two submitted score sheets, which need an "
           "active subscription (see case 4g) and a PAYSTACK_SECRET_KEY to activate.")
        return
    admin = ctx.token("admin_a")
    teacher = ctx.token("teacher_1")
    ids = state.get("student_ids") or []
    query = {"session_id": state.get("session_id"), "term_id": state.get("term_id")}

    # ---------------- CASE 13 ----------------
    compiled = signed_request(
        "POST", f"/schools/me/classes/{state.get('class_id')}/compile", token=teacher, query=query, expect=(200,),
    )
    data = compiled.data or {}
    problems = []
    if compiled.status != 200:
        problems.append(f"compile -> {compiled.status}: {excerpt(compiled)}")
    if data.get("blocked") is not False:
        problems.append(f"blocked={data.get('blocked')!r}")
    problems += check_fields(data, {"class_size": 3, "class_average": near(CLASS_AVERAGE)}, "")
    students = data.get("students") or []
    if len(students) != 3:
        problems.append(f"compiled {len(students)} students (want 3)")
    by_id = {row.get("student_id"): row for row in students if isinstance(row, dict)}
    for index, student_id in enumerate(ids):
        row = by_id.get(student_id) or {}
        problems += check_fields(row, {
            "total_score": near(TOTALS[index]),
            "average": near(AVERAGES[index]),
            "position": POSITIONS[index],
            "subjects_offered": 2,
            "subjects_passed": 2,
            "incomplete": False,
        }, f"student{index + 1}.")
        subject_rows = {item.get("subject_id"): item for item in row.get("subject_results") or []}
        problems += check_fields(subject_rows.get(state.get("subject1_id")) or {}, {
            "total": near(87 if index == 0 else 76 if index == 1 else 52),
            "grade": SUBJECT_1_GRADES[index],
            "position": POSITIONS[index],
            "complete": True,
        }, f"student{index + 1}.subject1.")
        problems += check_fields(subject_rows.get(state.get("subject2_id")) or {}, {
            "total": near(90 if index == 0 else 70 if index == 1 else 60),
            "grade": SUBJECT_2_GRADES[index],
            "position": POSITIONS[index],
            "complete": True,
        }, f"student{index + 1}.subject2.")
    stats = {row.get("subject_id"): row for row in data.get("subjects") or []}
    problems += check_fields(stats.get(state.get("subject1_id")) or {}, {
        "entered": 3, "expected": 3, "highest": near(87), "lowest": near(52), "average": near(71.7),
    }, "subject1.stats.")
    problems += check_fields(stats.get(state.get("subject2_id")) or {}, {
        "entered": 3, "expected": 3, "highest": near(90), "lowest": near(60), "average": near(73.3),
    }, "subject2.stats.")
    snapshot = (data.get("compilation") or {}).get("config_snapshot") or {}
    problems += check_fields(snapshot, {"total_max": near(100), "rank_policy": "competition", "pass_mark": near(40)}, "snapshot.")
    problems += check_fields(data.get("compilation") or {}, {"id": nonempty, "status": "draft"}, "compilation.")
    compilation_id = (data.get("compilation") or {}).get("id")
    if compilation_id:
        state.set("compilation_id", compilation_id)
    report.check("13", "compile produces the correct totals, grades, averages and positions", not problems, "; ".join(problems))
    if compiled.status != 200:
        report.block("13b", "the form teacher submits the compiled class", "compile did not return a compilation")
        report.block("14", "approve then publish works and the result locks", "compile did not return a compilation")
        return

    submitted = signed_request(
        "POST", f"/schools/me/classes/{state.get('class_id')}/submit-results", token=teacher, query=query, expect=(200,),
    )
    ok = submitted.status == 200 and ((submitted.data or {}).get("compilation") or {}).get("status") == "submitted"
    report.check("13b", "the form teacher submits the compiled class to the administrator", ok,
                 f"status {submitted.status}: {excerpt(submitted)}")
    if not ok:
        report.block("14", "approve then publish works and the result locks", "the class was not submitted")
        return

    # ---------------- CASE 14 ----------------
    require(ctx, "compilation_id")
    cid = state.get("compilation_id")
    problems = []
    approved = signed_request("POST", f"/schools/me/compilations/{cid}/approve", token=admin, expect=(200,))
    problems += check_fields((approved.data or {}).get("compilation") or {}, {"status": "approved", "approved_at": nonempty}, "")
    published = signed_request("POST", f"/schools/me/compilations/{cid}/publish", token=admin, expect=(200,))
    problems += check_fields((published.data or {}).get("compilation") or {}, {"status": "published", "published_at": nonempty}, "")
    locked = signed_request(
        "POST", f"/schools/me/classes/{state.get('class_id')}/compile", token=teacher, query=query, expect=(409,),
    )
    if locked.status != 409:
        problems.append(f"compile after publish -> {locked.status} (want 409)")
    elif "locked" not in detail_text(locked).lower():
        problems.append(f"409 does not mention the lock: {detail_text(locked)}")
    reapprove = signed_request("POST", f"/schools/me/compilations/{cid}/approve", token=admin, expect=(409,))
    if reapprove.status != 409:
        problems.append(f"approve after publish -> {reapprove.status} (want 409)")
    class_results = signed_request(
        "GET", f"/schools/me/classes/{state.get('class_id')}/results", token=teacher, query=query, expect=(200,),
    )
    rows = (class_results.data or {}).get("results") or []
    if len(rows) != 3:
        problems.append(f"class results has {len(rows)} rows (want 3)")
    if [row.get("position") for row in rows] != [1, 2, 3]:
        problems.append(f"positions={[row.get('position') for row in rows]}")
    audit = signed_request("GET", "/schools/me/audit", token=admin, expect=(200,))
    actions = {event.get("action") for event in (audit.data or {}).get("events") or []}
    for required in ("compiled", "results_submitted", "results_approved", "results_published"):
        if required not in actions:
            problems.append(f"audit is missing {required}")
    report.check("14", "approve then publish works, the result locks, and the audit trail records it", not problems, "; ".join(problems))


# ---------------------------------------------------------------------------
# Phase: results (cases 15, 16)
# ---------------------------------------------------------------------------
def phase_results(ctx: Ctx) -> None:
    report = ctx.report
    state = ctx.state
    if not all(state.get(k) for k in ("compilation_id", "student_a_id", "student_c_id")):
        skip_phase(report, [
            ("15", "a student reads only their own published result and is refused another's"),
            ("16", "another school's compilation id returns 404 and no data leaks"),
        ], "NOT COVERED: a published result and two student accounts are needed; both depend on an active "
           "subscription and therefore on a PAYSTACK_SECRET_KEY.")
        return
    cid = state.get("compilation_id")

    # ---------------- CASE 15 ----------------
    student_a = ctx.token("student_a")
    student_c = ctx.token("student_c")
    problems = []
    mine = signed_request("GET", "/schools/me/results", token=student_a, expect=(200,))
    rows = (mine.data or {}).get("results") or []
    if len(rows) != 1:
        problems.append(f"student A sees {len(rows)} results (want 1)")
    else:
        problems += check_fields(rows[0], {
            "compilation_id": cid,
            "total_score": near(177),
            "average": near(88.5),
            "position": 1,
            "class_size": 3,
            "subjects_offered": 2,
        }, "list.")
    report_card = signed_request("GET", f"/schools/me/results/{cid}", token=student_a, expect=(200,))
    card = report_card.data or {}
    problems += check_fields(card, {
        "status": "published",
        "total_score": near(177),
        "average": near(88.5),
        "position": 1,
        "class_size": 3,
        "subjects_offered": 2,
        "subjects_passed": 2,
        "class": "JSS 1A",
        "term": "First Term",
    }, "")
    problems += check_fields(card.get("student") or {}, {"id": state.get("student_a_id"), "admission_no": nonempty}, "student.")
    if len(card.get("subjects") or []) != 2:
        problems.append(f"report has {len(card.get('subjects') or [])} subjects (want 2)")
    else:
        subjects = {row.get("subject_id"): row for row in card["subjects"]}
        problems += check_fields(subjects.get(state.get("subject1_id")) or {}, {"total": near(87), "grade": "A1"}, "report.subject1.")
        problems += check_fields(subjects.get(state.get("subject2_id")) or {}, {"total": near(90), "grade": "A1"}, "report.subject2.")
    problems += check_fields(card.get("config") or {}, {"total_max": near(100)}, "config.")

    other_list = signed_request("GET", "/schools/me/results", token=student_c, expect=(200,))
    if (other_list.data or {}).get("results") != []:
        problems.append("student C sees results that are not theirs")
    forbidden = signed_request("GET", f"/schools/me/results/{cid}", token=student_c, expect=(403,))
    if forbidden.status != 403:
        problems.append(f"student C reading the class report -> {forbidden.status} (want 403)")
    report.check("15", "a student reads only their own published result and is refused another's", not problems, "; ".join(problems))

    # ---------------- CASE 16 ----------------
    admin_b = ctx.token("admin_b")
    problems = []
    name = f"PathSync Verify B {state.run_id()}"
    registered = signed_request(
        "POST", "/schools/register", token=admin_b,
        body={"name": name, "school_type": "secondary", "email": ctx.account("admin_b")["email"],
              "city": "Abuja", "state": "FCT", "country": "Nigeria"},
        expect=(200,),
    )
    school_b = (registered.data or {}).get("school") or {}
    if registered.status != 200:
        problems.append(f"register school B -> {registered.status}: {excerpt(registered)}")
    if school_b.get("id") == state.get("school_id"):
        problems.append("school B received the same id as school A")
    me_b = signed_request("GET", "/schools/me", token=admin_b, expect=(200,))
    problems += check_fields(me_b.data or {}, {"role": "school_admin"}, "")
    problems += check_fields((me_b.data or {}).get("school") or {}, {"id": school_b.get("id")}, "school.")
    approve = signed_request("POST", f"/schools/me/compilations/{cid}/approve", token=admin_b, expect=(404,))
    if approve.status != 404:
        problems.append(f"other school approve -> {approve.status} (want 404)")
    publish = signed_request("POST", f"/schools/me/compilations/{cid}/publish", token=admin_b, expect=(404,))
    if publish.status != 404:
        problems.append(f"other school publish -> {publish.status} (want 404)")
    sheet = signed_request("GET", f"/schools/me/sheets/{state.get('sheet1_id')}", token=admin_b, expect=(404,))
    if sheet.status != 404:
        problems.append(f"other school sheet -> {sheet.status} (want 404)")
    roster = signed_request("GET", "/schools/me/students", token=admin_b, expect=(200,))
    if (roster.data or {}).get("students") != []:
        problems.append("school B can see school A's students")
    role_gate = signed_request("GET", f"/schools/me/results/{cid}", token=admin_b, expect=(403,))
    if role_gate.status != 403:
        problems.append(f"admin reading a report card -> {role_gate.status} (want 403)")
    report.check("16", "another school's compilation id returns 404 and no data leaks", not problems, "; ".join(problems))


# ---------------------------------------------------------------------------
# Phase: webhook (case 18)
# ---------------------------------------------------------------------------
def phase_webhook(ctx: Ctx) -> None:
    report = ctx.report
    state = ctx.state
    require(ctx, "reference")
    admin = ctx.token("admin_a")
    run_id = state.run_id()

    if not PAYSTACK_SECRET_KEY or not state.get("payments_configured"):
        report.skip(
            "18", "the webhook rejects a bad signature and processes a replay once",
            "NOT COVERED: the deployed API answers 503 on /webhooks/paystack, so it holds no "
            "PAYSTACK_SECRET_KEY and no valid signature can exist"
            + ("" if PAYSTACK_SECRET_KEY else "; this shell has no PAYSTACK_SECRET_KEY either")
            + ". Manual step: set PAYSTACK_SECRET_KEY on Render and export the same value here, then "
            "re-run --phase webhook.",
        )
        return

    problems = []
    before = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
    invoices_before = len((before.data or {}).get("invoices") or [])
    payments_before = len((before.data or {}).get("payments") or [])

    rejected_event = f"evt_verify_{run_id}_reject"
    payload = {"event": "charge.success", "data": {"id": rejected_event, "reference": state.get("reference"), "status": "success"}}
    bad = webhook_post(payload, signature="0" * 128)
    if bad.status != 401:
        problems.append(f"bad signature -> {bad.status} (want 401): {excerpt(bad)}")
    elif "invalid signature" not in detail_text(bad).lower():
        problems.append(f"401 detail={detail_text(bad)!r}")
    missing = webhook_post(payload, signature="")
    if missing.status != 401:
        problems.append(f"missing signature -> {missing.status} (want 401)")

    # A correctly signed delivery of the *same* event id proves the 401 stored nothing.
    first = webhook_post(payload, secret=PAYSTACK_SECRET_KEY)
    if first.status != 200:
        problems.append(f"signed event -> {first.status} (want 200): {excerpt(first)}")
    elif (first.data or {}).get("duplicate") is True:
        problems.append("a signed event that was previously rejected was treated as a duplicate")
    replay = webhook_post(payload, secret=PAYSTACK_SECRET_KEY)
    if replay.status != 200:
        problems.append(f"replay -> {replay.status} (want 200)")
    elif (replay.data or {}).get("duplicate") is not True:
        problems.append(f"replay duplicate={((replay.data or {}).get('duplicate'))!r} (want True)")

    after = signed_request("GET", "/schools/me/subscription", token=admin, expect=(200,))
    if len((after.data or {}).get("invoices") or []) != invoices_before:
        problems.append("the replayed event created another invoice")
    if len((after.data or {}).get("payments") or []) != payments_before:
        problems.append("the replayed event created another payment")
    report.check("18", "the webhook rejects a bad signature and processes a replay once", not problems, "; ".join(problems))


# ---------------------------------------------------------------------------
# Phase: expiry (case 17)
# ---------------------------------------------------------------------------
def phase_expiry(ctx: Ctx, fixture_applied: bool) -> None:
    report = ctx.report
    state = ctx.state
    if not all(state.get(k) for k in ("school_id", "sheet1_id", "compilation_id", "student_a_id")):
        report.skip("17", "an expired subscription blocks premium writes while reads still work",
                    "NOT COVERED: the test school never had an active subscription to expire; case 4g "
                    "verifies the same write gate in the unsubscribed state instead.")
        return
    admin = ctx.token("admin_a")
    teacher = ctx.token("teacher_1")
    student_a = ctx.token("student_a")

    if not fixture_applied:
        report.skip(
            "17", "an expired subscription blocks premium writes while reads still work",
            "run this SQL in the Supabase SQL editor, then re-run --phase expiry --fixture-applied:\n"
            + expiry_fixture_sql(ctx),
        )
        return

    problems = []
    me = signed_request("GET", "/schools/me", token=admin, expect=(200,))
    problems += check_fields(me.data or {}, {"subscription_state": "expired"}, "")
    problems += check_fields((me.data or {}).get("school") or {}, {"id": state.get("school_id")}, "school.")
    roster = signed_request("GET", "/schools/me/students", token=admin, expect=(200,))
    if roster.status != 200 or not (roster.data or {}).get("students"):
        problems.append(f"read of students failed: {roster.status}")
    sheet = signed_request("GET", f"/schools/me/sheets/{state.get('sheet1_id')}", token=teacher, expect=(200,))
    if sheet.status != 200:
        problems.append(f"teacher cannot read a sheet after expiry: {sheet.status}")
    card = signed_request("GET", f"/schools/me/results/{state.get('compilation_id')}", token=student_a, expect=(200,))
    if card.status != 200 or (card.data or {}).get("status") != "published":
        problems.append(f"student report card after expiry -> {card.status}")

    blocked_student = signed_request(
        "POST", "/schools/me/students", token=admin,
        body={"admission_no": f"PV-{state.run_id()}-EXP", "first_name": "Expired", "last_name": "Write",
              "session_id": state.get("session_id")},
        expect=(402,),
    )
    if blocked_student.status != 402:
        problems.append(f"student create while expired -> {blocked_student.status} (want 402)")
    elif "expired" not in detail_text(blocked_student).lower():
        problems.append(f"402 detail={detail_text(blocked_student)!r}")
    blocked_compile = signed_request(
        "POST", f"/schools/me/classes/{state.get('class_id')}/compile", token=teacher,
        query={"session_id": state.get("session_id"), "term_id": state.get("term_id")}, expect=(402,),
    )
    if blocked_compile.status != 402:
        problems.append(f"compile while expired -> {blocked_compile.status} (want 402)")
    report.check("17", "an expired subscription blocks premium writes while reads still work", not problems, "; ".join(problems))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
PHASE_ORDER = ["setup", "pay", "teach", "compile", "results", "webhook", "expiry"]


def print_plan() -> None:
    print("PathSync School Result Compiler - live verification plan")
    print(f"  API      {API_BASE}")
    print(f"  auth     {AUTH_BASE}")
    print(f"  SUPA_KEY {'set' if SUPA_KEY else 'MISSING'}")
    print(f"  webhook  {'will be signed with PAYSTACK_SECRET_KEY' if PAYSTACK_SECRET_KEY else 'SKIP without PAYSTACK_SECRET_KEY'}")
    print("")
    plan = [
        ("setup", "1, 2a-2d, 3a, 5a, 6, 7", "no payment needed"),
        ("pay", "3b, 2c", "needs PAYSTACK_SECRET_KEY and a paid checkout"),
        ("teach", "4g, 8s, 5, 4, 4b, 8, 9, 10, 11, 12", "needs an active subscription"),
        ("compile", "13, 13b, 14", "needs both sheets submitted"),
        ("results", "15, 16", "needs a published compilation"),
        ("webhook", "18", "needs PAYSTACK_SECRET_KEY on the API and in this shell"),
        ("expiry", "17", "needs the SQL fixture and --fixture-applied"),
    ]
    for phase, cases, note in plan:
        print(f"  {phase:<8} cases {cases:<40} {note}")
    print("\n  --phase all runs every phase. Without a Paystack key it records the payment-gated")
    print("  cases as SKIP (not covered) instead of stopping, so one run reports everything.")


def self_test() -> int:
    """Offline checks of the pure helpers, so the file is known to run."""
    token = (
        base64.urlsafe_b64encode(json.dumps({"sub": "abc-123", "email": "x@y.z"}).encode()).decode().rstrip("=")
    )
    synthetic = f"header.{token}.signature"
    claims = jwt_claims(synthetic)
    assert claims.get("sub") == "abc-123", claims

    body = b'{"event":"charge.success"}'
    signature = hmac.new(b"secret", body, hashlib.sha512).hexdigest()
    assert len(signature) == 128 and signature == hmac.new(b"secret", body, hashlib.sha512).hexdigest()

    assert near(88.5)(88.5) and not near(88.5)(88.4)
    assert nonempty("x") and not nonempty("  ")
    assert check_fields({"a": 1}, {"a": 1, "b": 2}) == ["b=None (want 2)"]

    path = os.path.join(os.getcwd(), f".verify_selftest_{uuid.uuid4().hex[:6]}.json")
    state = State(path)
    state.set("k", {"v": 1})
    assert State(path).get("k") == {"v": 1}
    os.unlink(path)

    print("SELF-TEST PASS  jwt decode, HMAC-SHA512 signing, assertions and state file all behave")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Live verification for the PathSync School Result Compiler.")
    parser.add_argument("--phase", default="all", choices=PHASE_ORDER + ["all"])
    parser.add_argument("--state", default=DEFAULT_STATE, help="state file between phases")
    parser.add_argument("--fixture-applied", action="store_true", help="case 17 SQL has been run")
    parser.add_argument("--set-sheet", action="append", default=[], metavar="NAME=UUID",
                        help="supply a score sheet id (subject1 / subject2) created by the SQL fixture")
    parser.add_argument("--notes", action="store_true", help="print what each case proves")
    parser.add_argument("--teardown", action="store_true", help="print the SQL that removes the test data")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, do not touch the network")
    parser.add_argument("--self-test", action="store_true", help="offline checks of the helpers")
    parser.add_argument("--json", default="", metavar="PATH", help="write the PASS/FAIL matrix to a JSON file")
    args = parser.parse_args(argv)

    if args.notes:
        def note_key(value: str):
            digits = "".join(ch for ch in value if ch.isdigit())
            letters = "".join(ch for ch in value if ch.isalpha())
            return (int(digits or 0), letters)

        for case in sorted(NOTES, key=note_key):
            print(f"{case:<4} {NOTES[case]}\n")
        return 0

    if args.self_test:
        return self_test()

    if not SUPA_KEY and not (args.dry_run or args.teardown):
        print("SUPA_KEY is not set. Export the Supabase publishable (anon) key first.", file=sys.stderr)
        return 2

    state = State(args.state)
    report = Report()

    for item in args.set_sheet:
        if "=" not in item:
            print(f"--set-sheet expects NAME=UUID, got {item!r}", file=sys.stderr)
            return 2
        name, value = item.split("=", 1)
        state.set(f"sheet_{name.strip()}", value.strip())

    if args.teardown:
        print(teardown_sql(Ctx(state, report)))
        return 0

    if args.dry_run:
        print_plan()
        return 0

    ctx = Ctx(state, report)
    phases = PHASE_ORDER if args.phase == "all" else [args.phase]

    print(f"PathSync result compiler live verification  |  {API_BASE}  |  run {state.run_id()}\n")
    try:
        for phase in phases:
            print(f"-- phase {phase} " + "-" * (60 - len(phase)))
            if phase == "setup":
                phase_setup(ctx)
            elif phase == "pay":
                activated = phase_pay(ctx)
                if args.phase == "all" and not activated and state.get("payments_configured"):
                    # A real payment has to happen in a browser: stop and say so.
                    print("\nStopping: pay the checkout, then continue with --phase pay.")
                    break
            elif phase == "teach":
                phase_teach(ctx)
            elif phase == "compile":
                phase_compile(ctx)
            elif phase == "results":
                phase_results(ctx)
            elif phase == "webhook":
                phase_webhook(ctx)
            elif phase == "expiry":
                phase_expiry(ctx, args.fixture_applied)
    except Blocked as exc:
        report.block("--", f"phase {phase} stopped", str(exc))
    except AuthError as exc:
        report.block("--", f"phase {phase} could not authenticate", str(exc))
    except Exception as exc:  # a harness bug must still leave a readable report
        report.block("--", f"phase {phase} crashed", f"{type(exc).__name__}: {exc}")

    code = report.summary()
    if args.json:
        payload = {
            "api": API_BASE,
            "run_id": state.run_id(),
            "payments_configured": bool(state.get("payments_configured")),
            "counts": report.counts(),
            "records": [
                {"status": status, "case": case, "title": title, "detail": detail}
                for status, case, title, detail in report.records
            ],
        }
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
        print(f"wrote {args.json}")
    return code


if __name__ == "__main__":
    sys.exit(main())
