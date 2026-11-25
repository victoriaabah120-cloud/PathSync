"""Course certification.

A learner earns one certificate per course, and only when the backend can see that
every lesson is completed *and* the final course assessment has been passed. The
frontend can read its own certificates, but it can never write one: row-level
security allows reads only, and issuance happens here with the service role.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..ai import ask_json
from ..auth import get_current_user, get_supabase
from ..certification import (
    MIN_QUESTIONS,
    PASS_MARK,
    can_issue,
    certificate_code,
    course_status,
    grade_assessment,
)
from ..schemas import AssessmentSubmit, CourseRequest

router = APIRouter(tags=["certificates"])

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
    response = (
        db.table("certificates")
        .select("*")
        .eq("user_id", user_id)
        .eq("career_field", career_field)
        .eq("specialization", specialization)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _course_title(specialization: str) -> str:
    return f"{specialization} Learning Path"


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

    return {
        "assessment_id": rows[0]["id"],
        "total": len(questions),
        "pass_mark": PASS_MARK,
        # Answer keys stay on the server.
        "questions": [{"question": q["question"], "options": q["options"]} for q in questions],
    }


@router.post("/course/assessment/submit")
def submit_assessment(body: AssessmentSubmit, user=Depends(get_current_user)):
    """Grade the exam on the server and issue the certificate only if everything is met."""
    db = get_supabase()

    found = (
        db.table("course_assessments")
        .select("*")
        .eq("id", body.assessment_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    rows = found.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="We could not find that assessment.")

    assessment = rows[0]
    if str(assessment.get("status")) == "submitted":
        raise HTTPException(status_code=409, detail="This assessment has already been submitted.")

    questions = assessment.get("questions") or []
    result = grade_assessment(questions, body.answers)

    db.table("course_assessments").update(
        {
            "answers": body.answers,
            "score": result["percent"],
            "passed": result["passed"],
            "status": "submitted",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", assessment["id"]).execute()

    assessment.update({"status": "submitted", "passed": result["passed"], "score": result["percent"]})

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

    existing = _existing_certificate(db, user.id, assessment["career_field"], assessment["specialization"])
    if existing:
        payload["certificate"] = existing
        return payload

    status = course_status(lessons)
    code = certificate_code(user.id, assessment["career_field"], assessment["specialization"])
    holder = (user.user_metadata or {}).get("full_name") or user.email or "PathSync learner"

    row = {
        "user_id": user.id,
        "holder_name": str(holder),
        "course_title": _course_title(assessment["specialization"]),
        "career_field": assessment["career_field"],
        "specialization": assessment["specialization"],
        "score": result["percent"],
        "lessons_completed": status["completed"],
        "certificate_code": code,
    }
    try:
        inserted = db.table("certificates").insert(row).execute()
        payload["certificate"] = (inserted.data or [row])[0]
    except Exception:
        # A duplicate (unique on user + course) means the certificate already exists.
        payload["certificate"] = _existing_certificate(
            db, user.id, assessment["career_field"], assessment["specialization"]
        )

    return payload


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
