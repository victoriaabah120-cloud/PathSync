"""Course certification.

A learner earns one certificate per course, and only when the backend can see that
every lesson is completed *and* the final course assessment has been passed. The
frontend can read its own certificates, but it can never write one: row-level
security allows reads only, and issuance happens here with the service role.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from ..ai import ask_json
from ..auth import get_current_user, get_supabase
from ..certification import (
    MIN_QUESTIONS,
    PASS_MARK,
    can_issue,
    certificate_code,
    course_status,
    grade_assessment,
    validate_answers,
)
from ..schemas import AssessmentSubmit, CourseRequest

router = APIRouter(tags=["certificates"])
logger = logging.getLogger(__name__)

UNIQUE_VIOLATION = "23505"  # postgres: a certificate already exists
UNDEFINED_COLUMN = "42703"  # postgres: the table is older than this code

EXAM_SYSTEM = (
    "You write final exams for PathSync courses. Every question must be answerable from the "
    "course material described. Exactly one option is correct and the three wrong options must be "
    "plausible. Reply with JSON only."
)


def _lessons(db, user_id: str, career_field: str, specialization: str) -> list[dict]:
    response = (
        db.table("user_lessons")
        .select("id,title,summary,position,status,score")
        .eq("user_id", user_id)
        .eq("career_field", career_field)
        .eq("specialization", specialization)
        .order("position")
        .execute()
    )
    return response.data or []


def _existing_certificate(db, user_id: str, career_field: str, specialization: str):
    """The course certificate for this learner, looked up by its deterministic code.

    The code is derived from the learner and the course, so looking it up this way
    ignores certificates the older build issued for a single lesson: those are a
    different kind of record and must never count as course certification.
    """
    code = certificate_code(user_id, career_field, specialization)
    response = (
        db.table("certificates")
        .select("*")
        .eq("certificate_code", code)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _course_title(specialization: str) -> str:
    return f"{specialization} Learning Path"


def _own_assessment(db, assessment_id: str, user_id: str):
    """The assessment, but only if it belongs to this learner."""
    response = (
        db.table("course_assessments")
        .select("*")
        .eq("id", assessment_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _course_assessments(db, user_id: str, career_field: str, specialization: str, status: str, passed=None):
    query = (
        db.table("course_assessments")
        .select("*")
        .eq("user_id", user_id)
        .eq("career_field", career_field)
        .eq("specialization", specialization)
        .eq("status", status)
    )
    if passed is not None:
        query = query.eq("passed", passed)
    response = query.order("created_at", desc=True).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def _exam_payload(assessment: dict) -> dict:
    """What the browser is allowed to see: questions and options, never the answer key."""
    questions = assessment.get("questions") or []
    return {
        "assessment_id": assessment["id"],
        "total": len(questions),
        "pass_mark": PASS_MARK,
        "questions": [{"question": q.get("question"), "options": q.get("options")} for q in questions],
    }


def _stored_result(assessment: dict | None) -> dict:
    """The result already saved for a submitted assessment."""
    row = assessment or {}
    questions = row.get("questions") or []
    total = len(questions)
    score = row.get("score")
    correct = round((score or 0) * total / 100) if total else 0
    return {
        "passed": bool(row.get("passed")),
        "score": score,
        "correct": correct,
        "total": total,
        "pass_mark": PASS_MARK,
        "certificate": None,
    }


def _error_code(exc: Exception) -> str:
    """Postgres error code from a supabase-py exception, when there is one."""
    for attribute in ("code", "error_code"):
        value = getattr(exc, attribute, None)
        if value:
            return str(value)
    text = str(exc)
    for candidate in (UNIQUE_VIOLATION, UNDEFINED_COLUMN):
        if candidate in text:
            return candidate
    return ""


def _issue_certificate(db, user, assessment: dict, lessons: list[dict]) -> dict:
    """Create the certificate once, or return the existing one.

    Raises HTTPException when no certificate exists and none could be created, so a
    caller can never report success for a certificate that was not written.
    """
    career_field = assessment.get("career_field")
    specialization = assessment.get("specialization")

    existing = _existing_certificate(db, user.id, career_field, specialization)
    if existing:
        return existing

    status = course_status(lessons)
    code = certificate_code(user.id, career_field, specialization)
    holder = (user.user_metadata or {}).get("full_name") or user.email or "PathSync learner"
    row = {
        "user_id": user.id,
        "holder_name": str(holder),
        "course_title": _course_title(specialization),
        "career_field": career_field,
        "specialization": specialization,
        "score": assessment.get("score"),
        "lessons_completed": status["completed"],
        "certificate_code": code,
    }

    try:
        inserted = db.table("certificates").insert(row).execute()
    except Exception as exc:  # noqa: BLE001 - classified below
        kind = _error_code(exc)
        if kind == UNIQUE_VIOLATION:
            # Another request issued it first; that certificate is the answer.
            existing = _existing_certificate(db, user.id, career_field, specialization)
            if existing:
                return existing
            logger.error("certificate unique violation without a stored row for %s", user.id)
            raise HTTPException(
                status_code=502,
                detail="The certificate could not be created. Please try again.",
            ) from exc
        logger.exception("certificate insert failed for %s", user.id)
        if kind == UNDEFINED_COLUMN:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Certificates cannot be stored yet because the database is missing a "
                    "required column, so no certificate was issued. Your result has been saved."
                ),
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="The certificate could not be created. Your result has been saved, so please try again.",
        ) from exc

    created = inserted.data or []
    stored = created[0] if created else None
    if not stored:
        # A write that returns no row is not proof of success: read it back.
        stored = _existing_certificate(db, user.id, career_field, specialization)
    if not stored or stored.get("certificate_code") != code:
        logger.error("certificate insert was not readable back for %s", user.id)
        raise HTTPException(
            status_code=502,
            detail="The certificate could not be created. Your result has been saved, so please try again.",
        )
    return stored


@router.post("/course/assessment/start")
def start_assessment(body: CourseRequest, user=Depends(get_current_user)):
    """Open the final assessment for a course the learner has actually finished."""
    db = get_supabase()
    lessons = _lessons(db, user.id, body.career_field, body.specialization)
    status = course_status(lessons)

    if status["total"] == 0:
        raise HTTPException(status_code=409, detail="There is no course to certify yet.")

    existing = _existing_certificate(db, user.id, body.career_field, body.specialization)
    if existing:
        return {"already_certified": True, "certificate": existing}

    if not status["complete"]:
        raise HTTPException(
            status_code=409,
            detail=(
                "Finish every lesson first. Still to complete: "
                + ", ".join(status["remaining"][:4])
                + ("..." if len(status["remaining"]) > 4 else "")
            ),
        )

    # A passed assessment whose certificate never got written can be completed here,
    # so a storage failure never strands a learner who has already passed.
    passed = _course_assessments(db, user.id, body.career_field, body.specialization, "submitted", True)
    if passed:
        certificate = _issue_certificate(db, user, passed, lessons)
        return {"already_certified": True, "certificate": certificate}

    # Reuse an exam that was already generated for this course instead of piling up
    # attempts, and never hand out a second exam before the first is submitted.
    pending = _course_assessments(db, user.id, body.career_field, body.specialization, "pending")
    if pending and len(pending.get("questions") or []) >= MIN_QUESTIONS:
        return _exam_payload(pending)

    outline = "\n".join(
        f"{index + 1}. {lesson.get('title', '')} — {lesson.get('summary') or 'no summary'}"
        for index, lesson in enumerate(lessons)
    )
    prompt = (
        f"Course: {body.specialization} (field: {body.career_field}).\n"
        f"Lessons in order:\n{outline}\n\n"
        "Write a final exam of exactly 10 multiple-choice questions that tests the whole course, "
        "not a single lesson. Each question has 4 options and answer_index is the position (0-3) "
        "of the correct option. Spread the correct answers around.\n"
        "Return JSON in exactly this shape:\n"
        '{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], '
        '"answer_index": 0, "explanation": "one sentence"}]}'
    )
    data = ask_json(EXAM_SYSTEM, prompt, temperature=0.3, max_tokens=3000)

    questions = []
    for item in data.get("questions") or []:
        if not isinstance(item, dict):
            continue
        options = item.get("options")
        index = item.get("answer_index")
        if (
            item.get("question")
            and isinstance(options, list)
            and len(options) == 4
            and isinstance(index, int)
            and 0 <= index <= 3
        ):
            questions.append(
                {
                    "question": str(item["question"]),
                    "options": [str(option) for option in options],
                    "answer_index": index,
                    "explanation": str(item.get("explanation", "")),
                }
            )

    if len(questions) < MIN_QUESTIONS:
        raise HTTPException(status_code=502, detail="The AI did not return a usable final exam. Please try again.")

    created = (
        db.table("course_assessments")
        .insert(
            {
                "user_id": user.id,
                "career_field": body.career_field,
                "specialization": body.specialization,
                "questions": questions,
                "status": "pending",
            }
        )
        .execute()
    )
    rows = created.data or []
    if not rows:
        raise HTTPException(status_code=502, detail="The final assessment could not be saved. Please try again.")

    # Answer keys stay on the server.
    stored = rows[0]
    return _exam_payload({**stored, "questions": stored.get("questions") or questions})


@router.post("/course/assessment/submit")
def submit_assessment(body: AssessmentSubmit, user=Depends(get_current_user)):
    """Grade the exam on the server and issue the certificate only if everything is met.

    The submitted sheet is validated against the stored questions, marked with the
    server-side answer key, and claimed with a conditional update so the same
    assessment can never be processed twice.
    """
    db = get_supabase()

    assessment = _own_assessment(db, body.assessment_id, user.id)
    if not assessment:
        raise HTTPException(status_code=404, detail="We could not find that assessment.")

    if str(assessment.get("status")) != "pending":
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This assessment has already been submitted.",
                "result": _stored_result(assessment),
            },
        )

    questions = assessment.get("questions") or []
    problem = validate_answers(questions, body.answers)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    result = grade_assessment(questions, body.answers)

    # Claim the assessment: only a row that is still pending can move to submitted, so
    # two requests racing on the same exam cannot both be marked.
    claimed = (
        db.table("course_assessments")
        .update(
            {
                "answers": body.answers,
                "score": result["percent"],
                "passed": result["passed"],
                "status": "submitted",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", assessment["id"])
        .eq("user_id", user.id)
        .eq("status", "pending")
        .execute()
    )
    if not (claimed.data or []):
        current = _own_assessment(db, body.assessment_id, user.id)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This assessment has already been submitted.",
                "result": _stored_result(current),
            },
        )

    assessment = {
        **assessment,
        "status": "submitted",
        "passed": result["passed"],
        "score": result["percent"],
    }

    payload = {
        "passed": result["passed"],
        "score": result["percent"],
        "correct": result["correct"],
        "total": result["total"],
        "pass_mark": PASS_MARK,
        "certificate": None,
    }

    if not result["passed"]:
        return payload

    # Passing is not enough on its own: re-read the course from the database.
    lessons = _lessons(db, user.id, assessment["career_field"], assessment["specialization"])
    allowed, reason = can_issue(lessons, assessment)
    if not allowed:
        raise HTTPException(status_code=409, detail=reason)

    payload["certificate"] = _issue_certificate(db, user, assessment, lessons)
    return payload


@router.get("/certificates/course")
def course_certificate(
    career_field: str = Query(min_length=1, max_length=80),
    specialization: str = Query(min_length=1, max_length=80),
    user=Depends(get_current_user),
):
    """Does this learner hold the course certificate? Answered by the backend, so the
    app never has to guess from whatever rows happen to exist."""
    db = get_supabase()
    return {"certificate": _existing_certificate(db, user.id, career_field, specialization)}


@router.get("/certificates/verify/{code}")
def verify_certificate(code: str):
    """Public check: anyone holding a certificate ID can confirm it is genuine."""
    cleaned = code.strip().upper()
    if not cleaned or len(cleaned) > 64:
        return {"valid": False, "reason": "That does not look like a PathSync certificate ID."}

    db = get_supabase()
    try:
        response = db.table("certificates").select("*").eq("certificate_code", cleaned).limit(1).execute()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Certificate verification is unavailable right now. Please try again shortly.",
        )
    rows = response.data or []
    if not rows:
        return {"valid": False, "reason": "No certificate with that ID was issued by PathSync."}

    row = rows[0]
    return {
        "valid": True,
        "certificate_code": row.get("certificate_code"),
        "holder_name": row.get("holder_name"),
        "course_title": row.get("course_title"),
        "specialization": row.get("specialization"),
        "score": row.get("score"),
        "lessons_completed": row.get("lessons_completed"),
        "issued_at": row.get("issued_at"),
    }
