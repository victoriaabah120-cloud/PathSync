"""End-to-end rules for the assessment and certificate endpoints.

The Supabase client is replaced with an in-memory fake so every branch can be
exercised, including the failures that cannot be triggered on a live database
(a lost race, a failed insert, an out-of-date table).

Run with pytest, or directly: python3 tests/test_certificate_api.py
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# app.auth imports supabase-py; the fake client below is all these tests need.
if "supabase" not in sys.modules:
    stub = types.ModuleType("supabase")
    stub.Client = object
    stub.create_client = lambda *args, **kwargs: None
    sys.modules["supabase"] = stub

import logging  # noqa: E402

from fastapi import HTTPException  # noqa: E402

logging.disable(logging.CRITICAL)  # expected failures are asserted, not logged

from app import certification  # noqa: E402
from app.auth import get_current_user  # noqa: E402
from app.routers import certificates as api  # noqa: E402
from app.schemas import AssessmentSubmit, CourseRequest  # noqa: E402

COURSE = {"career_field": "Engineering", "specialization": "Civil Engineering"}
QUESTIONS = [
    {"question": f"Question {i + 1}?", "options": ["A", "B", "C", "D"], "answer_index": i % 4}
    for i in range(10)
]
CORRECT = [q["answer_index"] for q in QUESTIONS]
WRONG = [(q["answer_index"] + 1) % 4 for q in QUESTIONS]


# --------------------------------------------------------------------------- fakes
class FakeError(Exception):
    def __init__(self, code, message="boom"):
        super().__init__(message)
        self.code = code


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.filters = []
        self.op = None
        self.payload = None
        self.order_spec = None
        self.limit_n = None

    def select(self, *args, **kwargs):
        self.op = "select"
        return self

    def insert(self, rows):
        self.op = "insert"
        self.payload = rows
        return self

    def update(self, patch):
        self.op = "update"
        self.payload = patch
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def order(self, column, desc=False):
        self.order_spec = (column, desc)
        return self

    def limit(self, count):
        self.limit_n = count
        return self

    def _matches(self):
        rows = self.db.tables.get(self.table, [])
        found = [r for r in rows if all(r.get(c) == v for c, v in self.filters)]
        if self.order_spec:
            column, desc = self.order_spec
            found = sorted(found, key=lambda r: r.get(column) or "", reverse=desc)
        return found

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "select":
            found = [dict(r) for r in self._matches()]
            return FakeResponse(found[: self.limit_n] if self.limit_n else found)

        if self.op == "insert":
            if self.db.insert_error:
                raise self.db.insert_error
            row = dict(self.payload)
            if self.table == "certificates" and row.get("certificate_code"):
                for existing in rows:
                    if existing.get("certificate_code") == row.get("certificate_code"):
                        raise FakeError("23505", "duplicate key value violates unique constraint")
            row.setdefault("id", f"{self.table}-{len(rows) + 1}")
            row.setdefault("created_at", f"2026-11-26T00:00:0{len(rows)}Z")
            row.setdefault("issued_at", "2026-11-26T00:00:00Z")
            rows.append(row)
            return FakeResponse([dict(row)])

        if self.op == "update":
            if self.db.update_blocks:
                return FakeResponse([])
            updated = []
            for row in self._matches():
                row.update(self.payload)
                updated.append(dict(row))
            return FakeResponse(updated)

        raise AssertionError(f"unexpected operation {self.op}")


class FakeDB:
    def __init__(self):
        self.tables = {"user_lessons": [], "certificates": [], "course_assessments": []}
        self.insert_error = None
        self.update_blocks = False

    def table(self, name):
        return FakeQuery(self, name)

    # helpers -----------------------------------------------------------------
    def add_lessons(self, user_id, statuses, course=None):
        course = course or COURSE
        for index, status in enumerate(statuses):
            self.tables["user_lessons"].append(
                {
                    "id": f"lesson-{index + 1}",
                    "user_id": user_id,
                    "career_field": course["career_field"],
                    "specialization": course["specialization"],
                    "title": f"Lesson {index + 1}",
                    "summary": "summary",
                    "position": index + 1,
                    "status": status,
                    "score": 90 if status == "completed" else None,
                }
            )

    def add_assessment(self, user_id, status="pending", passed=None, score=None, course=None):
        course = course or COURSE
        row = {
            "id": f"assessment-{len(self.tables['course_assessments']) + 1}",
            "user_id": user_id,
            "career_field": course["career_field"],
            "specialization": course["specialization"],
            "questions": QUESTIONS,
            "answers": None,
            "score": score,
            "passed": passed,
            "status": status,
            "created_at": f"2026-11-26T00:00:0{len(self.tables['course_assessments'])}Z",
            "submitted_at": None,
        }
        self.tables["course_assessments"].append(row)
        return row["id"]

    def add_certificate(self, user_id, course=None):
        course = course or COURSE
        row = {
            "id": f"certificate-{len(self.tables['certificates']) + 1}",
            "user_id": user_id,
            "holder_name": "Alex Morgan",
            "course_title": f"{course['specialization']} Learning Path",
            "career_field": course["career_field"],
            "specialization": course["specialization"],
            "score": 90,
            "lessons_completed": 3,
            "certificate_code": certification.certificate_code(
                user_id, course["career_field"], course["specialization"]
            ),
            "issued_at": "2026-11-26T00:00:00Z",
        }
        self.tables["certificates"].append(row)
        return row


class FakeUser:
    def __init__(self, user_id="student-1", email="alex@example.com", name="Alex Morgan"):
        self.id = user_id
        self.email = email
        self.user_metadata = {"full_name": name}


def install(db, exam=None):
    """Point the router at a fake database and a deterministic exam generator."""
    api.get_supabase = lambda: db
    api.ask_json = lambda *args, **kwargs: {
        "questions": exam
        or [{"question": q["question"], "options": q["options"], "answer_index": q["answer_index"]} for q in QUESTIONS]
    }
    return db


def expect(status, fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
    except HTTPException as exc:
        assert exc.status_code == status, f"expected {status}, got {exc.status_code}: {exc.detail}"
        return exc.detail
    raise AssertionError(f"expected HTTP {status}, but the call returned {result!r}")


def course_request():
    return CourseRequest(**COURSE)


def submit_body(assessment_id, answers):
    return AssessmentSubmit(assessment_id=assessment_id, answers=answers)


# ------------------------------------------------------- 1. eligibility rules
def test_incomplete_lessons_cannot_start():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed", "current", "locked"])
    detail = expect(409, api.start_assessment, course_request(), user=FakeUser())
    assert "Finish every lesson first" in detail
    assert db.tables["course_assessments"] == []


def test_no_course_cannot_start():
    db = install(FakeDB())
    detail = expect(409, api.start_assessment, course_request(), user=FakeUser())
    assert "no course" in detail.lower()


def test_completed_lessons_can_start():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    payload = api.start_assessment(course_request(), user=FakeUser())
    assert payload["total"] == 10
    assert payload["pass_mark"] == 80
    assert len(payload["questions"]) == 10
    assert all("answer_index" not in q for q in payload["questions"]), "the answer key must never be sent"
    assert len(db.tables["course_assessments"]) == 1


def test_start_reuses_a_pending_exam_instead_of_generating_another():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    first = api.start_assessment(course_request(), user=FakeUser())
    second = api.start_assessment(course_request(), user=FakeUser())
    assert first["assessment_id"] == second["assessment_id"]
    assert len(db.tables["course_assessments"]) == 1


def test_start_requires_authentication():
    expect(401, get_current_user, "")


# ------------------------------------------------- 2. answer validation/scoring
def test_invalid_answer_sheets_are_rejected():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    cases = {
        "short": [0, 1, 2],
        "padded": CORRECT + [0],
        "missing entry": [0, 1, 2, 3, 4, 5, 6, 7, 8, None],
        "out of range": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        "negative": [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    }
    for name, answers in cases.items():
        detail = expect(422, api.submit_assessment, submit_body(assessment_id, answers), user=FakeUser())
        assert isinstance(detail, str) and detail, f"{name} should explain the problem"

    row = db.tables["course_assessments"][0]
    assert row["status"] == "pending" and row["score"] is None, "a rejected sheet must not be marked"


def test_score_is_calculated_from_the_server_answer_key():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    # The client sends its own invented score/pass fields; they must be ignored.
    body = AssessmentSubmit(assessment_id=assessment_id, answers=WRONG)
    payload = api.submit_assessment(body, user=FakeUser())
    assert payload["score"] == 0 and payload["passed"] is False
    assert db.tables["course_assessments"][0]["score"] == 0


# ---------------------------------------------------------- 3. one submission
def test_duplicate_submission_is_rejected_and_returns_the_saved_result():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    first = api.submit_assessment(submit_body(assessment_id, WRONG), user=FakeUser())
    assert first["passed"] is False

    detail = expect(409, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    assert detail["message"] == "This assessment has already been submitted."
    assert detail["result"]["score"] == first["score"]
    assert db.tables["course_assessments"][0]["score"] == 0, "the saved result must not be overwritten"


def test_concurrent_submission_cannot_be_processed_twice():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")
    api.submit_assessment(submit_body(assessment_id, WRONG), user=FakeUser())

    # Simulate the losing request: it read the row while it was still pending, then the
    # conditional update finds nothing to claim.
    stale = dict(db.tables["course_assessments"][0])
    stale["status"] = "pending"
    original = api._own_assessment
    api._own_assessment = lambda db_, aid, uid: stale
    try:
        detail = expect(409, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    finally:
        api._own_assessment = original
    assert "already been submitted" in detail["message"]
    assert len(db.tables["certificates"]) == 0


# ------------------------------------------------------- 4. failed assessments
def test_failed_assessment_saves_the_result_and_issues_nothing():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    payload = api.submit_assessment(submit_body(assessment_id, WRONG), user=FakeUser())
    assert payload["passed"] is False and payload["certificate"] is None
    row = db.tables["course_assessments"][0]
    assert row["status"] == "submitted" and row["score"] == 0 and row["passed"] is False
    assert db.tables["certificates"] == []


def test_a_failed_student_can_take_a_new_assessment():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")
    api.submit_assessment(submit_body(assessment_id, WRONG), user=FakeUser())

    payload = api.start_assessment(course_request(), user=FakeUser())
    assert payload["assessment_id"] != assessment_id
    assert len(db.tables["course_assessments"]) == 2


# ------------------------------------------------------ 5. certificate safeguards
def test_passing_assessment_issues_one_certificate():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    payload = api.submit_assessment(submit_body(assessment_id, CORRECT), user=FakeUser())
    assert payload["passed"] is True and payload["score"] == 100
    certificate = payload["certificate"]
    assert certificate and certificate["certificate_code"].startswith("PS-")
    assert certificate["lessons_completed"] == 3
    assert certificate["course_title"] == "Civil Engineering Learning Path"
    assert len(db.tables["certificates"]) == 1


def test_certificate_is_not_issued_when_lessons_became_incomplete():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    # A lesson is reopened between starting and submitting.
    db.tables["user_lessons"][1]["status"] = "current"
    detail = expect(409, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    assert "not finished" in detail.lower() or "Finish" in detail
    assert db.tables["certificates"] == []


def test_a_second_certificate_is_never_created():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    existing = db.add_certificate("student-1")

    started = api.start_assessment(course_request(), user=FakeUser())
    assert started["already_certified"] is True
    assert started["certificate"]["id"] == existing["id"]

    # A replay of an already-submitted exam is rejected and still leaves one certificate.
    assessment_id = db.add_assessment("student-1", status="submitted", passed=True, score=100)
    expect(409, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    assert len(db.tables["certificates"]) == 1


def test_certificate_creation_failure_is_not_reported_as_success():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")
    db.insert_error = FakeError("XX000", "connection reset")

    detail = expect(502, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    assert "could not be created" in detail
    assert db.tables["certificates"] == []


def test_outdated_certificate_table_fails_loudly():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")
    db.insert_error = FakeError("42703", "column certificates.course_title does not exist")

    detail = expect(503, api.submit_assessment, submit_body(assessment_id, CORRECT), user=FakeUser())
    assert "no certificate was issued" in detail
    assert db.tables["certificates"] == []


def test_a_passed_result_whose_certificate_failed_is_completed_later():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    db.add_assessment("student-1", status="submitted", passed=True, score=100)

    payload = api.start_assessment(course_request(), user=FakeUser())
    assert payload["already_certified"] is True
    assert payload["certificate"]["certificate_code"].startswith("PS-")
    assert len(db.tables["certificates"]) == 1


def test_duplicate_insert_is_resolved_to_the_existing_certificate():
    db = install(FakeDB())
    db.add_lessons("student-1", ["completed"] * 3)
    assessment_id = db.add_assessment("student-1")

    # The certificate appears between the existence check and the insert.
    original = api._existing_certificate
    calls = {"n": 0}

    def racing(db_, user_id, field, spec):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return db.tables["certificates"][0]

    db.tables["certificates"].append(
        {
            "id": "certificate-race",
            "user_id": "student-1",
            "holder_name": "Alex Morgan",
            "course_title": "Civil Engineering Learning Path",
            "career_field": COURSE["career_field"],
            "specialization": COURSE["specialization"],
            "score": 100,
            "lessons_completed": 3,
            "certificate_code": certification.certificate_code(
                "student-1", COURSE["career_field"], COURSE["specialization"]
            ),
            "issued_at": "2026-11-26T00:00:00Z",
        }
    )
    api._existing_certificate = racing
    try:
        payload = api.submit_assessment(submit_body(assessment_id, CORRECT), user=FakeUser())
    finally:
        api._existing_certificate = original
    assert payload["certificate"]["id"] == "certificate-race"
    assert len(db.tables["certificates"]) == 1


# ------------------------------------------------------------- 6. ownership
def test_a_student_cannot_touch_another_students_assessment():
    db = install(FakeDB())
    db.add_lessons("student-2", ["completed"] * 3)
    foreign = db.add_assessment("student-2")

    expect(404, api.submit_assessment, submit_body(foreign, CORRECT), user=FakeUser("student-1"))
    row = db.tables["course_assessments"][0]
    assert row["status"] == "pending" and row["score"] is None
    assert db.tables["certificates"] == []


# ---------------------------------------------------------- 7. verification
def test_certificate_verification():
    db = install(FakeDB())
    certificate = db.add_certificate("student-1")

    valid = api.verify_certificate(certificate["certificate_code"].lower())
    assert valid["valid"] is True
    assert valid["holder_name"] == "Alex Morgan"
    assert valid["score"] == 90

    unknown = api.verify_certificate("PS-NOTREAL01")
    assert unknown["valid"] is False and "No certificate" in unknown["reason"]


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS  {name}")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"FAIL  {name} — {type(exc).__name__}: {exc}")
    print(f"\n{len([n for n in globals() if n.startswith('test_')]) - failures} passed, {failures} failed")
    sys.exit(1 if failures else 0)
