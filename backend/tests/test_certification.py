"""Rules for course completion and certificate issuance.

Runs with pytest, or directly: python3 tests/test_certification.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.certification import (  # noqa: E402
    MIN_QUESTIONS,
    PASS_MARK,
    can_issue,
    certificate_code,
    course_status,
    grade_assessment,
    validate_answers,
)


def lessons(*statuses):
    return [{"title": f"Lesson {i + 1}", "position": i + 1, "status": s} for i, s in enumerate(statuses)]


def exam(correct=10, total=10, passed=True, status="submitted"):
    return {
        "status": status,
        "passed": passed,
        "score": round(correct / total * 100),
        "questions": [{"question": f"q{i}", "options": ["a", "b", "c", "d"], "answer_index": 1} for i in range(total)],
    }


# ---------- answer sheets ----------
SHEET = [{"question": f"q{i}", "options": ["a", "b", "c", "d"], "answer_index": 1} for i in range(4)]


def test_a_complete_valid_sheet_is_accepted():
    assert validate_answers(SHEET, [0, 1, 2, 3]) is None


def test_incomplete_or_impossible_sheets_are_rejected():
    assert "Answer all 4" in validate_answers(SHEET, [0, 1])
    assert "Answer all 4" in validate_answers(SHEET, [0, 1, 2, 3, 0])
    assert "missing" in validate_answers(SHEET, [0, 1, None, 3])
    assert "not one of the available options" in validate_answers(SHEET, [0, 1, 9, 3])
    assert "not one of the available options" in validate_answers(SHEET, [-1, 1, 2, 3])
    assert "missing" in validate_answers(SHEET, [True, 1, 2, 3])
    assert validate_answers([], []) is not None


def test_grading_never_rewards_a_missing_or_impossible_answer():
    key = [{"question": "q", "options": ["a", "b"], "answer_index": 1}] * 4
    assert grade_assessment(key, [1, 1, 1, 1])["correct"] == 4
    assert grade_assessment(key, [1, 1, 1])["correct"] == 3
    assert grade_assessment(key, [1, 1, 1, 7])["correct"] == 3
    assert grade_assessment(key, [1, 1, 1, None])["correct"] == 3


# ---------- course progress ----------
def test_course_status_needs_every_lesson():
    assert course_status([])["complete"] is False
    assert course_status(lessons("completed", "current", "locked"))["complete"] is False
    assert course_status(lessons("completed", "completed"))["complete"] is True


def test_course_status_counts_and_names_remaining():
    status = course_status(lessons("completed", "current", "locked"))
    assert (status["total"], status["completed"]) == (3, 1)
    assert status["remaining"] == ["Lesson 2", "Lesson 3"]
    assert status["percent"] == 33


# ---------- grading ----------
def test_grading_all_correct():
    questions = [{"options": ["a", "b"], "answer_index": 1}] * 10
    result = grade_assessment(questions, [1] * 10)
    assert result["correct"] == 10 and result["percent"] == 100 and result["passed"] is True


def test_grading_pass_mark_boundary():
    questions = [{"options": ["a", "b"], "answer_index": 1}] * 10
    eight = grade_assessment(questions, [1] * 8 + [0] * 2)
    seven = grade_assessment(questions, [1] * 7 + [0] * 3)
    assert eight["percent"] == 80 and eight["passed"] is True
    assert seven["percent"] == 70 and seven["passed"] is False
    assert PASS_MARK == 80


def test_unanswered_questions_count_as_wrong():
    questions = [{"options": ["a", "b"], "answer_index": 0}] * 10
    result = grade_assessment(questions, [0, 0, None, 0])
    assert result["correct"] == 3 and result["passed"] is False


def test_grading_an_empty_exam_never_passes():
    assert grade_assessment([], [])["passed"] is False


# ---------- certificate codes ----------
def test_certificate_code_is_stable_and_unique_per_course():
    first = certificate_code("user-1", "Engineering", "Civil Engineering")
    again = certificate_code("user-1", "engineering", "civil engineering ")
    other_course = certificate_code("user-1", "Engineering", "Mechanical Engineering")
    other_user = certificate_code("user-2", "Engineering", "Civil Engineering")
    assert first == again, "the same learner and course must keep one code"
    assert len({first, other_course, other_user}) == 3
    assert first.startswith("PS-") and len(first) == 13


# ---------- issuance rules ----------
def test_no_certificate_while_a_lesson_is_unfinished():
    allowed, reason = can_issue(lessons("completed", "current"), exam())
    assert allowed is False and "not finished" in reason


def test_no_certificate_without_a_passed_assessment():
    allowed, reason = can_issue(lessons("completed", "completed"), None)
    assert allowed is False and "final assessment" in reason

    pending = can_issue(lessons("completed", "completed"), exam(status="pending"))
    assert pending[0] is False and "not been submitted" in pending[1]

    failed = can_issue(lessons("completed", "completed"), exam(correct=5, passed=False))
    assert failed[0] is False and "needs 80%" in failed[1]


def test_no_certificate_for_a_too_short_exam():
    short = exam(total=MIN_QUESTIONS - 1)
    allowed, reason = can_issue(lessons("completed"), short)
    assert allowed is False and "too short" in reason


def test_certificate_after_full_completion_and_pass():
    allowed, reason = can_issue(lessons("completed", "completed", "completed"), exam())
    assert allowed is True and "Course complete" in reason


def test_empty_course_cannot_be_certified():
    allowed, reason = can_issue([], exam())
    assert allowed is False and "no course" in reason


if __name__ == "__main__":
    failures = 0
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name} — {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
