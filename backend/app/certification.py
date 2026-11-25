"""Course completion and certificate rules.

Pure functions only (no FastAPI, no Supabase) so the rules can be tested directly.
A certificate is earned by finishing *every* lesson in the course and passing the
final course assessment; finishing a single lesson is never enough.
"""
from __future__ import annotations

import hashlib

PASS_MARK = 80  # percent needed on the final course assessment
MIN_QUESTIONS = 5  # a final assessment needs at least this many questions


def _status(lesson: dict) -> str:
    return str(lesson.get("status") or "").strip().lower()


def course_status(lessons: list[dict]) -> dict:
    """Summarise a learner's progress through one course."""
    rows = [l for l in (lessons or []) if isinstance(l, dict)]
    total = len(rows)
    completed = sum(1 for l in rows if _status(l) == "completed")
    remaining = [
        str(l.get("title") or f"Lesson {l.get('position', '?')}")
        for l in rows
        if _status(l) != "completed"
    ]
    return {
        "total": total,
        "completed": completed,
        "remaining": remaining,
        "complete": total > 0 and completed == total,
        "percent": round((completed / total) * 100) if total else 0,
    }


def grade_assessment(questions: list[dict], answers: list) -> dict:
    """Grade a final assessment. Unanswered questions count as wrong."""
    rows = [q for q in (questions or []) if isinstance(q, dict)]
    total = len(rows)
    if total == 0:
        return {"correct": 0, "total": 0, "percent": 0, "passed": False, "pass_mark": PASS_MARK}

    correct = 0
    for index, question in enumerate(rows):
        expected = question.get("answer_index")
        given = answers[index] if index < len(answers) else None
        if isinstance(expected, int) and isinstance(given, int) and given == expected:
            correct += 1

    percent = round((correct / total) * 100)
    return {
        "correct": correct,
        "total": total,
        "percent": percent,
        "passed": percent >= PASS_MARK,
        "pass_mark": PASS_MARK,
    }


def certificate_code(user_id: str, career_field: str, specialization: str) -> str:
    """A stable, unique-per-course code: the same learner and course always map to
    the same code, which is what stops a second certificate being issued."""
    seed = f"{user_id}|{career_field.strip().lower()}|{specialization.strip().lower()}"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:10].upper()
    return f"PS-{digest}"


def can_issue(lessons: list[dict], assessment: dict | None) -> tuple[bool, str]:
    """Decide whether a certificate may be issued right now."""
    status = course_status(lessons)
    if status["total"] == 0:
        return False, "There is no course to certify yet."
    if not status["complete"]:
        left = len(status["remaining"])
        return False, f"The course is not finished: {left} lesson(s) still to complete."

    if not assessment:
        return False, "The final assessment has not been passed yet."

    if str(assessment.get("status") or "").lower() != "submitted":
        return False, "The final assessment has not been submitted yet."

    if not assessment.get("passed"):
        return False, f"The final assessment needs {PASS_MARK}% to pass."

    questions = assessment.get("questions") or []
    if len(questions) < MIN_QUESTIONS:
        return False, "The final assessment was too short to certify."

    return True, "Course complete and final assessment passed."
