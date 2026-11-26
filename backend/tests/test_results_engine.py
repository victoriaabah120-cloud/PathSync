"""Rules of the results engine. Runs with pytest or directly: python3 tests/test_results_engine.py"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.results_engine import (  # noqa: E402
    assign_positions,
    compile_class,
    config_snapshot,
    grade_for,
    subject_total,
    validate_row,
)

SCALE = [
    {"min": 75, "max": 100, "grade": "A1", "remark": "Excellent"},
    {"min": 70, "max": 74, "grade": "B2", "remark": "Very good"},
    {"min": 65, "max": 69, "grade": "B3", "remark": "Good"},
    {"min": 60, "max": 64, "grade": "C4", "remark": "Credit"},
    {"min": 55, "max": 59, "grade": "C5", "remark": "Credit"},
    {"min": 50, "max": 54, "grade": "C6", "remark": "Credit"},
    {"min": 45, "max": 49, "grade": "D7", "remark": "Pass"},
    {"min": 40, "max": 44, "grade": "E8", "remark": "Pass"},
    {"min": 0, "max": 39, "grade": "F9", "remark": "Fail"},
]

CONFIG = {
    "id": "cfg1",
    "version": 3,
    "ca1_max": 10,
    "ca2_max": 10,
    "ca3_max": 10,
    "exam_max": 70,
    "total_max": 100,
    "pass_mark": 40,
    "grading_scale": SCALE,
    "rank_policy": "competition",
    "incomplete_policy": "block",
}


def _student(sid):
    return {"id": sid, "name": f"Student {sid}", "admission_no": f"ADM{sid}"}


def _row(ca1, ca2, ca3, exam):
    return {"ca1": ca1, "ca2": ca2, "ca3": ca3, "exam": exam}


# ---------- totals and grades ----------
def test_total_is_the_sum_of_the_four_parts():
    assert subject_total(_row(10, 9, 8, 60)) == 87


def test_a_missing_part_means_no_total():
    assert subject_total({"ca1": 10, "ca2": 9, "ca3": None, "exam": 60}) is None
    assert subject_total({}) is None


def test_grades_come_from_the_configured_scale():
    assert grade_for(87, SCALE)["grade"] == "A1"
    assert grade_for(70, SCALE)["grade"] == "B2"
    assert grade_for(40, SCALE)["grade"] == "E8"
    assert grade_for(39, SCALE)["grade"] == "F9"
    assert grade_for(None, SCALE) == {"grade": None, "remark": None}


def test_validation_uses_the_configured_maxima():
    assert validate_row(_row(10, 10, 10, 70), CONFIG) == []
    assert any("ca1" in p for p in validate_row(_row(11, 10, 10, 70), CONFIG))
    assert any("exam" in p for p in validate_row(_row(10, 10, 10, 71), CONFIG))
    assert any("negative" in p for p in validate_row(_row(-1, 10, 10, 70), CONFIG))


def test_a_different_scale_is_respected():
    wide = {**CONFIG, "ca1_max": 20, "ca2_max": 20, "ca3_max": 20, "exam_max": 40}
    assert validate_row(_row(20, 20, 20, 40), wide) == []
    assert validate_row(_row(25, 20, 20, 40), wide)


# ---------- positions ----------
def test_position_policies():
    entries = [{"key": "a", "value": 90}, {"key": "b", "value": 80}, {"key": "c", "value": 80}, {"key": "d", "value": 70}]
    assert assign_positions(entries, "competition") == {"a": 1, "b": 2, "c": 2, "d": 4}
    assert assign_positions(entries, "dense") == {"a": 1, "b": 2, "c": 2, "d": 3}
    assert assign_positions(entries, "ordinal") == {"a": 1, "b": 2, "c": 3, "d": 4}


# ---------- compilation ----------
def test_compilation_totals_averages_and_positions():
    subjects = [{"id": "m", "name": "Maths"}, {"id": "e", "name": "English"}]
    students = [_student("1"), _student("2"), _student("3")]
    sheets = {
        "m": {"status": "submitted", "scores": {"1": _row(10, 10, 10, 60), "2": _row(5, 5, 5, 40), "3": _row(10, 9, 9, 55)}},
        "e": {"status": "submitted", "scores": {"1": _row(8, 8, 8, 50), "2": _row(9, 9, 9, 60), "3": _row(6, 6, 6, 30)}},
    }
    out = compile_class(CONFIG, subjects, students, sheets)
    assert out["blocked"] is False
    by_id = {r["student_id"]: r for r in out["students"]}
    # student 1: 90 + 74 = 164, average 82
    assert by_id["1"]["total_score"] == 164
    assert by_id["1"]["average"] == 82
    assert by_id["1"]["subjects_passed"] == 2
    assert by_id["1"]["position"] == 1
    # student 2: 55 + 87 = 142, average 71
    assert by_id["2"]["total_score"] == 142
    assert by_id["2"]["position"] == 2
    # student 3: 83 + 48 = 131
    assert by_id["3"]["total_score"] == 131
    assert by_id["3"]["position"] == 3
    assert out["class_size"] == 3
    assert out["class_average"] == round((82 + 71 + 65.5) / 3, 1)


def test_subject_statistics_and_positions():
    subjects = [{"id": "m", "name": "Maths"}]
    students = [_student("1"), _student("2")]
    sheets = {"m": {"status": "submitted", "scores": {"1": _row(10, 10, 10, 70), "2": _row(0, 0, 0, 20)}}}
    out = compile_class(CONFIG, subjects, students, sheets)
    stats = out["subjects"][0]
    assert stats["highest"] == 100 and stats["lowest"] == 20 and stats["average"] == 60
    subject_rows = {r["student_id"]: r["subject_results"][0] for r in out["students"]}
    assert subject_rows["1"]["position"] == 1 and subject_rows["1"]["grade"] == "A1"
    assert subject_rows["2"]["position"] == 2 and subject_rows["2"]["grade"] == "F9"


def test_failed_subjects_are_counted():
    subjects = [{"id": "m", "name": "Maths"}, {"id": "e", "name": "English"}]
    students = [_student("1")]
    sheets = {
        "m": {"status": "submitted", "scores": {"1": _row(0, 0, 0, 30)}},
        "e": {"status": "submitted", "scores": {"1": _row(10, 10, 10, 60)}},
    }
    out = compile_class(CONFIG, subjects, students, sheets)
    row = out["students"][0]
    assert row["subjects_passed"] == 1 and row["subjects_failed"] == 1


def test_missing_scores_block_by_default():
    subjects = [{"id": "m", "name": "Maths"}, {"id": "e", "name": "English"}]
    students = [_student("1"), _student("2")]
    sheets = {
        "m": {"status": "submitted", "scores": {"1": _row(10, 10, 10, 60)}},
        "e": {"status": "submitted", "scores": {"1": _row(8, 8, 8, 50), "2": _row(9, 9, 9, 60)}},
    }
    out = compile_class(CONFIG, subjects, students, sheets)
    assert out["blocked"] is True
    assert {m["student_id"] for m in out["missing"]} == {"2"}


def test_missing_scores_are_never_treated_as_zero():
    subjects = [{"id": "m", "name": "Maths"}]
    students = [_student("1"), _student("2")]
    sheets = {"m": {"status": "submitted", "scores": {"1": _row(10, 10, 10, 60)}}}
    exclude = {**CONFIG, "incomplete_policy": "exclude"}
    out = compile_class(exclude, subjects, students, sheets)
    assert out["blocked"] is False
    rows = {r["student_id"]: r for r in out["students"]}
    assert rows["2"]["incomplete"] is True
    assert rows["2"]["total_score"] == 0
    assert rows["2"]["position"] is None
    assert out["class_size"] == 1  # only the complete student is ranked


def test_config_snapshot_is_stored_with_the_result():
    snapshot = config_snapshot(CONFIG)
    assert snapshot["version"] == 3
    assert snapshot["pass_mark"] == 40
    assert snapshot["ca1_max"] == 10
    assert len(snapshot["grading_scale"]) == len(SCALE)


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {test.__name__} — {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
