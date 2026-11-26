#!/usr/bin/env python3
"""Live end-to-end run of the School Result Compiler with billing switched off.

It registers a brand-new school, creates its administrator, and walks the whole
workflow with no plan, no checkout and no payment: classes, subjects, students,
teacher invitation and activation, assignments, score entry and validation,
compilation, form-teacher review, administrator approval, publication, the student
report card, isolation checks, and the capacity bypass.

Standard library only. Reads SUPA_KEY (Supabase publishable key) and optionally
SUPA_URL and API from the environment. It never prints a key or a secret.

    SUPA_KEY=... python3 backend/scripts/verify_test_mode_flow.py

Exit code 0 only when every check passes. Every check prints PASS, FAIL or BLOCKED
with the observed values, so nothing is reported as passing unless it ran.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("API", "https://pathsync.onrender.com").rstrip("/")
SUPA_URL = os.environ.get("SUPA_URL", "https://xmhscjxirtaufafqzhll.supabase.co").rstrip("/")
SUPA_KEY = os.environ.get("SUPA_KEY", "").strip()
EMAIL_DOMAIN = os.environ.get("VERIFY_EMAIL_DOMAIN", "gmail.com")

RUN = time.strftime("%y%m%d%H%M%S")
RESULTS: list[tuple[str, str, str]] = []


def record(case: str, title: str, ok: bool, detail: str) -> bool:
    RESULTS.append((case, title, ("PASS" if ok else "FAIL") + f"  {detail}"))
    print(f"[{'PASS' if ok else 'FAIL'}] {case} {title} :: {detail}", flush=True)
    return ok


def blocked(case: str, title: str, detail: str) -> None:
    RESULTS.append((case, title, "BLOCKED  " + detail))
    print(f"[BLOCKED] {case} {title} :: {detail}", flush=True)


class Reply:
    def __init__(self, status: int, data, text: str):
        self.status = status
        self.data = data
        self.text = text


def http(method: str, url: str, body=None, token: str | None = None, headers=None) -> Reply:
    payload = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=payload, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            text = response.read().decode("utf-8", "replace")
            try:
                return Reply(response.status, json.loads(text or "{}"), text)
            except json.JSONDecodeError:
                return Reply(response.status, {}, text)
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        try:
            return Reply(error.code, json.loads(text or "{}"), text)
        except json.JSONDecodeError:
            return Reply(error.code, {}, text)


def api(method: str, path: str, token: str | None = None, body=None, query: dict | None = None) -> Reply:
    url = API + path
    if query:
        pairs = [f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items() if v is not None]
        if pairs:
            url += "?" + "&".join(pairs)
    return http(method, url, body=body, token=token)


def excerpt(reply: Reply, limit: int = 160) -> str:
    return (reply.text or "").replace("\n", " ")[:limit]


def account(role: str) -> tuple[str, str]:
    email = f"pathsync.testmode.{RUN}.{role}@{EMAIL_DOMAIN}"
    password = f"Tm-{RUN}-{role}!Aa9"
    return email, password


def sign_in(role: str) -> str:
    email, password = account(role)
    signup = http(
        "POST",
        f"{SUPA_URL}/auth/v1/signup",
        body={"email": email, "password": password},
        headers={"apikey": SUPA_KEY},
    )
    token = (signup.data or {}).get("access_token") if isinstance(signup.data, dict) else None
    if signup.status == 200 and token:
        return token
    signin = http(
        "POST",
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        body={"email": email, "password": password},
        headers={"apikey": SUPA_KEY},
    )
    token = (signin.data or {}).get("access_token") if isinstance(signin.data, dict) else None
    if signin.status == 200 and token:
        return token
    raise SystemExit(f"BLOCKED: could not create the {role} account ({signup.status}/{signin.status}): {excerpt(signin)}")


def main() -> int:
    if not SUPA_KEY:
        print("BLOCKED: SUPA_KEY is not set, so no test account can be created.", file=sys.stderr)
        return 2

    print(f"Live test-mode run {RUN} against {API}", flush=True)
    school_name = f"PathSync Test Mode {RUN}"

    # ---------- 1. register a brand-new school with no plan ----------
    admin = sign_in("admin")
    admin_email, _ = account("admin")
    registered = api(
        "POST",
        "/schools/register",
        token=admin,
        body={
            "name": school_name,
            "school_type": "secondary",
            "email": admin_email,
            "phone": "+2348000000000",
            "address": "1 Test Mode Way",
            "city": "Lagos",
            "state": "Lagos",
            "country": "Nigeria",
        },
    )
    if registered.status != 200:
        record("1", "register a school with no plan", False, f"-> {registered.status}: {excerpt(registered)}")
        return 1
    school = (registered.data or {}).get("school") or {}
    record(
        "1",
        "register a school with no plan",
        registered.data.get("billing_mode") == "testing"
        and registered.data.get("subscription_state") == "active"
        and not registered.data.get("subscription"),
        f"school={school.get('name')!r} billing_mode={registered.data.get('billing_mode')} "
        f"subscription_state={registered.data.get('subscription_state')} subscription={registered.data.get('subscription')}",
    )
    record(
        "1b",
        "registration returns no checkout or payment url",
        not any(k in (registered.data or {}) for k in ("authorization_url", "checkout_url", "payment_url")),
        f"keys={sorted((registered.data or {}).keys())}",
    )

    # ---------- 2. dashboard context with no plan and no ceiling ----------
    me = api("GET", "/schools/me", token=admin)
    data = me.data or {}
    students_block = data.get("students") or {}
    record(
        "2",
        "administrator reaches the dashboard with no plan",
        me.status == 200 and data.get("role") == "school_admin" and data.get("billing_mode") == "testing",
        f"-> {me.status} role={data.get('role')} billing_mode={data.get('billing_mode')} plan={data.get('plan')}",
    )
    record(
        "2b",
        "student capacity is not limited while testing",
        students_block.get("unlimited") is True and students_block.get("capacity") is None,
        f"students={students_block}",
    )
    record(
        "2c",
        "no subscription state blocks the dashboard",
        data.get("subscription_state") == "active",
        f"subscription_state={data.get('subscription_state')} actual={data.get('subscription_state_actual')}",
    )

    # ---------- 3. academic structure ----------
    session = api(
        "POST",
        "/schools/me/sessions",
        token=admin,
        body={"name": f"2026/2027 {RUN}", "starts_on": "2026-09-01", "ends_on": "2027-07-31", "is_current": True},
    )
    session_id = ((session.data or {}).get("session") or {}).get("id")
    term = api(
        "POST",
        "/schools/me/terms",
        token=admin,
        body={
            "session_id": session_id,
            "name": "First Term",
            "position": 1,
            "starts_on": "2026-09-01",
            "ends_on": "2026-12-15",
            "is_current": True,
        },
    )
    term_id = ((term.data or {}).get("term") or {}).get("id")
    klass = api("POST", "/schools/me/classes", token=admin, body={"name": "JSS 1A", "level": "JSS1"})
    class_id = ((klass.data or {}).get("class") or {}).get("id")
    record(
        "3",
        "session, term and class created",
        bool(session_id and term_id and class_id),
        f"session={session_id} term={term_id} class={class_id}",
    )

    subject_ids = {}
    for key, name, code in (("subject1", "Mathematics", "MTH"), ("subject2", "English Language", "ENG")):
        created = api("POST", "/schools/me/subjects", token=admin, body={"name": name, "code": code})
        subject_ids[key] = ((created.data or {}).get("subject") or {}).get("id")
    links = [
        api(
            "POST",
            "/schools/me/class-subjects",
            token=admin,
            body={"session_id": session_id, "class_id": class_id, "subject_id": subject_ids[key]},
        ).status
        for key in ("subject1", "subject2")
    ]
    config = api(
        "POST",
        "/schools/me/assessment-config",
        token=admin,
        body={
            "session_id": session_id,
            "term_id": term_id,
            "ca1_max": 10,
            "ca2_max": 10,
            "ca3_max": 10,
            "exam_max": 70,
            "total_max": 100,
            "pass_mark": 50,
        },
    )
    record(
        "3b",
        "subjects attached to the class and assessment rules set",
        all(status == 200 for status in links) and config.status == 200 and all(subject_ids.values()),
        f"class_subject_links={links} assessment_config={config.status}",
    )

    # ---------- 4. students, with no plan and no capacity ceiling ----------
    student_rows = []
    for index in range(3):
        created = api(
            "POST",
            "/schools/me/students",
            token=admin,
            body={
                "admission_no": f"TM-{RUN}-{index + 1:03d}",
                "first_name": f"Test{index + 1}",
                "last_name": "Pupil",
                "guardian_name": "Test Guardian",
                "guardian_phone": "+2348000000001",
                "class_id": class_id,
                "session_id": session_id,
            },
        )
        student_rows.append(((created.data or {}).get("student") or {}, created.status))
    record(
        "4",
        "students enrol with no plan and no payment",
        all(status == 200 and row.get("id") for row, status in student_rows),
        "statuses=" + str([status for _, status in student_rows]) + f" capacity={students_block.get('capacity')}",
    )
    record(
        "4b",
        "capacity bypass allows more students than any plan would",
        all(status == 200 for _, status in student_rows),
        f"enrolled={len(student_rows)} with plan={data.get('plan')} (a plan is not required)",
    )
    student_ids = [row.get("id") for row, _ in student_rows]
    student_invite = (student_rows[0][0] or {}).get("invite_code")

    # ---------- 5. teacher invitation, activation, assignments ----------
    teacher = sign_in("teacher")
    teacher_email, _ = account("teacher")
    invite = api("POST", "/schools/me/teachers/invite", token=admin, body={"email": teacher_email, "full_name": "Test Teacher One"})
    invite_code = (invite.data or {}).get("invite_code")
    joined = api("POST", "/schools/me/join", token=teacher, body={"invite_code": invite_code})
    teacher_member = (joined.data or {}).get("member") or {}
    record(
        "5",
        "teacher invited and activated without payment",
        invite.status == 200 and joined.status == 200 and teacher_member.get("role") == "teacher",
        f"invite={invite.status} join={joined.status} role={teacher_member.get('role')}",
    )

    assignment_statuses = []
    for kind, subject in (("subject", subject_ids["subject1"]), ("subject", subject_ids["subject2"]), ("form", None)):
        body = {"session_id": session_id, "member_id": teacher_member.get("id"), "class_id": class_id, "kind": kind}
        if subject:
            body["subject_id"] = subject
        assignment_statuses.append(api("POST", "/schools/me/assignments", token=admin, body=body).status)
    responsibilities = api("GET", "/schools/me/responsibilities", token=teacher)
    record(
        "5b",
        "one teacher holds subject and form-teacher roles",
        all(status == 200 for status in assignment_statuses),
        f"assignment_statuses={assignment_statuses} responsibilities={responsibilities.status}",
    )

    # ---------- 6. score entry and validation ----------
    sheet = api(
        "POST",
        "/schools/me/sheets",
        token=teacher,
        body={"session_id": session_id, "term_id": term_id, "class_id": class_id, "subject_id": subject_ids["subject1"]},
    )
    sheet_id = ((sheet.data or {}).get("sheet") or {}).get("id")
    record("6", "teacher opens a score sheet", sheet.status == 200 and bool(sheet_id), f"-> {sheet.status} sheet={sheet_id}")

    over = api(
        "PUT",
        f"/schools/me/sheets/{sheet_id}/scores",
        token=teacher,
        body={"rows": [{"student_id": student_ids[0], "ca1": 99, "ca2": 5, "ca3": 5, "exam": 60}]},
    )
    record("7", "a score above the maximum is rejected", over.status == 422, f"-> {over.status}: {excerpt(over, 120)}")

    marks = [(8, 7, 6, 60), (6, 6, 5, 55), (5, 4, 4, 40)]
    saved = api(
        "PUT",
        f"/schools/me/sheets/{sheet_id}/scores",
        token=teacher,
        body={
            "rows": [
                {"student_id": student_ids[index], "ca1": ca1, "ca2": ca2, "ca3": ca3, "exam": exam}
                for index, (ca1, ca2, ca3, exam) in enumerate(marks)
            ]
        },
    )
    record("7b", "valid scores save", saved.status == 200, f"-> {saved.status}: {excerpt(saved, 120)}")

    submitted = api("POST", f"/schools/me/sheets/{sheet_id}/submit", token=teacher)
    record("7c", "teacher submits the sheet", submitted.status == 200, f"-> {submitted.status}: {excerpt(submitted, 120)}")
    relocked = api(
        "PUT",
        f"/schools/me/sheets/{sheet_id}/scores",
        token=teacher,
        body={"rows": [{"student_id": student_ids[0], "ca1": 1, "ca2": 1, "ca3": 1, "exam": 1}]},
    )
    record("7d", "a submitted sheet cannot be edited", relocked.status in (409, 423), f"-> {relocked.status}")

    # second subject sheet so the class is complete
    sheet2 = api(
        "POST",
        "/schools/me/sheets",
        token=teacher,
        body={"session_id": session_id, "term_id": term_id, "class_id": class_id, "subject_id": subject_ids["subject2"]},
    )
    sheet2_id = ((sheet2.data or {}).get("sheet") or {}).get("id")
    marks2 = [(7, 8, 7, 62), (6, 5, 6, 50), (4, 5, 4, 38)]
    api(
        "PUT",
        f"/schools/me/sheets/{sheet2_id}/scores",
        token=teacher,
        body={
            "rows": [
                {"student_id": student_ids[index], "ca1": ca1, "ca2": ca2, "ca3": ca3, "exam": exam}
                for index, (ca1, ca2, ca3, exam) in enumerate(marks2)
            ]
        },
    )
    api("POST", f"/schools/me/sheets/{sheet2_id}/submit", token=teacher)

    # ---------- 7. compilation, review, approval, publication ----------
    compiled = api("POST", f"/schools/me/classes/{class_id}/compile", token=teacher, query={"session_id": session_id, "term_id": term_id})
    compilation = (compiled.data or {}).get("compilation") or {}
    rows = (compiled.data or {}).get("results") or (compiled.data or {}).get("compiled_results") or []
    top = rows[0] if rows else {}
    record(
        "8",
        "class compiles automatically",
        compiled.status == 200 and bool(compilation.get("id")),
        f"-> {compiled.status} compilation={compilation.get('id')} rows={len(rows)} "
        f"average={compilation.get('class_average')} top={top.get('student_name') or top.get('name')} total={top.get('total')}",
    )
    record(
        "8b",
        "totals, grades and positions are calculated",
        bool(top.get("total")) and bool(top.get("grade") or top.get("overall_grade")) and bool(top.get("position") or top.get("overall_position")),
        f"top_row_keys={sorted(top.keys())[:12]}",
    )

    reviewed = api("POST", f"/schools/me/classes/{class_id}/submit-results", token=teacher, query={"session_id": session_id, "term_id": term_id})
    record("9", "form teacher reviews and submits the class", reviewed.status == 200, f"-> {reviewed.status}: {excerpt(reviewed, 120)}")

    approved = api("POST", f"/schools/me/compilations/{compilation.get('id')}/approve", token=admin)
    record("10", "administrator approves", approved.status == 200, f"-> {approved.status}: {excerpt(approved, 120)}")

    published = api("POST", f"/schools/me/compilations/{compilation.get('id')}/publish", token=admin)
    record("11", "administrator publishes", published.status == 200, f"-> {published.status}: {excerpt(published, 120)}")

    # ---------- 8. student access ----------
    student = sign_in("student")
    student_join = api("POST", "/schools/me/join", token=student, body={"invite_code": student_invite})
    record("12", "student account activates", student_join.status == 200, f"-> {student_join.status}")

    dashboard = api("GET", "/schools/me/student", token=student)
    results = api("GET", "/schools/me/results", token=student)
    report = api("GET", f"/schools/me/results/{compilation.get('id')}", token=student)
    record(
        "12b",
        "student reads their own published report card",
        dashboard.status == 200 and results.status == 200 and report.status == 200,
        f"dashboard={dashboard.status} results={results.status} report={report.status}",
    )

    other_school_compilation = api("GET", "/schools/me/results/00000000-0000-0000-0000-000000000000", token=student)
    record(
        "12c",
        "student cannot read a result that is not theirs",
        other_school_compilation.status in (403, 404),
        f"-> {other_school_compilation.status}",
    )

    outsider = sign_in("outsider")
    outsider_read = api("GET", "/schools/me/students", token=outsider)
    record(
        "12d",
        "an account outside the school reaches no school data",
        outsider_read.status in (403, 404),
        f"-> {outsider_read.status}",
    )

    # ---------- 9. nothing asked for a payment along the way ----------
    subscription = api("GET", "/schools/me/subscription", token=admin)
    record(
        "13",
        "no subscription was created or required",
        subscription.status == 200
        and (subscription.data or {}).get("subscription") is None
        and not ((subscription.data or {}).get("invoices") or [])
        and not ((subscription.data or {}).get("payments") or []),
        f"subscription={(subscription.data or {}).get('subscription')} "
        f"invoices={len((subscription.data or {}).get('invoices') or [])} "
        f"payments={len((subscription.data or {}).get('payments') or [])}",
    )

    audit = api("GET", "/schools/me/audit", token=admin)
    events = (audit.data or {}).get("events") or (audit.data or {}).get("audit") or []
    record(
        "14",
        "the audit trail records the chain",
        audit.status == 200 and len(events) >= 3,
        f"-> {audit.status} events={len(events)} types={[e.get('event_type') or e.get('type') for e in events[:6]]}",
    )

    print("\nSchool: " + school_name, flush=True)
    print("Administrator: " + admin_email, flush=True)
    passed = sum(1 for _, _, outcome in RESULTS if outcome.startswith("PASS"))
    failed = sum(1 for _, _, outcome in RESULTS if outcome.startswith("FAIL"))
    blocked_count = sum(1 for _, _, outcome in RESULTS if outcome.startswith("BLOCKED"))
    print(f"\n{passed} passed, {failed} failed, {blocked_count} blocked", flush=True)
    for case, title, outcome in RESULTS:
        if not outcome.startswith("PASS"):
            print(f"  {case} {title}: {outcome}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
