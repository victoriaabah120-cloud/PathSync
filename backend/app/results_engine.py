"""Result compilation maths for the School Result Compiler.

Pure functions with no database or FastAPI imports, so every rule can be tested
directly: totals, grades, positions under the configured tie policy, class
statistics, pass counts and the incomplete-result policy.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

RANK_POLICIES = ("competition", "dense", "ordinal")
INCOMPLETE_POLICIES = ("block", "exclude")
PARTS = ("ca1", "ca2", "ca3", "exam")


def _round1(value) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _num(value):
    """A score as a float, or None when it was never entered."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def config_snapshot(config: dict) -> dict:
    """The assessment and grading settings a compilation was produced with.

    Stored on the compilation so a later change to the school's rules cannot alter
    results that were already compiled or published.
    """
    return {
        "config_id": config.get("id"),
        "version": config.get("version"),
        "ca1_max": float(config.get("ca1_max") or 0),
        "ca2_max": float(config.get("ca2_max") or 0),
        "ca3_max": float(config.get("ca3_max") or 0),
        "exam_max": float(config.get("exam_max") or 0),
        "total_max": float(config.get("total_max") or 0),
        "pass_mark": float(config.get("pass_mark") or 0),
        "grading_scale": list(config.get("grading_scale") or []),
        "rank_policy": config.get("rank_policy") or "competition",
        "incomplete_policy": config.get("incomplete_policy") or "block",
    }


def grade_for(score, scale: list[dict]) -> dict:
    """Grade and remark for a total, using the school's configured scale."""
    value = _num(score)
    if value is None:
        return {"grade": None, "remark": None}
    for band in sorted(scale or [], key=lambda b: float(b.get("min", 0)), reverse=True):
        low = float(band.get("min", 0))
        high = float(band.get("max", 100))
        if low <= value <= high:
            return {"grade": band.get("grade"), "remark": band.get("remark")}
    return {"grade": None, "remark": None}


def subject_total(row: dict) -> float | None:
    """CA1 + CA2 + CA3 + Exam. Any missing part means there is no total yet."""
    values = [_num(row.get(part)) for part in PARTS]
    if any(v is None for v in values):
        return None
    return _round1(sum(values))


def row_is_complete(row: dict) -> bool:
    return all(_num(row.get(part)) is not None for part in PARTS)


def validate_row(row: dict, config: dict) -> list[str]:
    """Problems with one student's score row, checked against the configured maxima."""
    problems: list[str] = []
    for part in PARTS:
        raw = row.get(part)
        value = _num(raw)
        if raw in (None, ""):
            continue
        if value is None:
            problems.append(f"{part} is not a number")
            continue
        if value < 0:
            problems.append(f"{part} cannot be negative")
        maximum = float(config.get(f"{part}_max") or 0)
        if value > maximum:
            problems.append(f"{part} {value:g} is above the maximum of {maximum:g}")
    return problems


def assign_positions(entries: list[dict], policy: str = "competition") -> dict:
    """Positions for [{key, value}], highest value first.

    competition: 1, 2, 2, 4   dense: 1, 2, 2, 3   ordinal: 1, 2, 3, 4
    """
    if policy not in RANK_POLICIES:
        policy = "competition"
    ordered = sorted(entries, key=lambda e: (-float(e["value"]), str(e["key"])))
    positions: dict = {}
    previous = None
    previous_position = 0
    for index, entry in enumerate(ordered, start=1):
        value = float(entry["value"])
        if policy == "ordinal":
            positions[entry["key"]] = index
        elif previous is not None and value == previous:
            positions[entry["key"]] = previous_position
        else:
            position = index if policy == "competition" else previous_position + 1
            positions[entry["key"]] = position
            previous_position = position
        previous = value
    return positions


def compile_class(
    config: dict,
    subjects: list[dict],
    students: list[dict],
    sheets: dict,
) -> dict:
    """Compile one class for one term.

    ``sheets`` maps subject_id to {"status": str, "scores": {student_id: row}}.
    Missing scores are never treated as zero: the school's incomplete policy either
    blocks the compilation or excludes that student from the ranking, flagged.
    """
    snapshot = config_snapshot(config)
    scale = snapshot["grading_scale"]
    pass_mark = snapshot["pass_mark"]
    policy = snapshot["rank_policy"]
    incomplete_policy = snapshot["incomplete_policy"]

    subject_stats: dict = {}
    per_student: dict = {s["id"]: [] for s in students}
    missing: list[dict] = []

    for subject in subjects:
        sid = subject["id"]
        sheet = sheets.get(sid) or {}
        scores = sheet.get("scores") or {}
        complete_totals: list[dict] = []
        for student in students:
            row = scores.get(student["id"]) or {}
            total = subject_total(row)
            if total is None:
                missing.append(
                    {
                        "subject_id": sid,
                        "subject": subject.get("name"),
                        "student_id": student["id"],
                        "student": student.get("name"),
                        "sheet_status": sheet.get("status"),
                    }
                )
                per_student[student["id"]].append(
                    {
                        "subject_id": sid,
                        "subject": subject.get("name"),
                        "ca1": _num(row.get("ca1")),
                        "ca2": _num(row.get("ca2")),
                        "ca3": _num(row.get("ca3")),
                        "exam": _num(row.get("exam")),
                        "total": None,
                        "grade": None,
                        "remark": None,
                        "position": None,
                        "class_highest": None,
                        "class_lowest": None,
                        "class_average": None,
                        "complete": False,
                    }
                )
                continue
            complete_totals.append({"key": student["id"], "value": total})
            graded = grade_for(total, scale)
            per_student[student["id"]].append(
                {
                    "subject_id": sid,
                    "subject": subject.get("name"),
                    "ca1": _num(row.get("ca1")),
                    "ca2": _num(row.get("ca2")),
                    "ca3": _num(row.get("ca3")),
                    "exam": _num(row.get("exam")),
                    "total": total,
                    "grade": graded["grade"],
                    "remark": graded["remark"],
                    "position": None,
                    "class_highest": None,
                    "class_lowest": None,
                    "class_average": None,
                    "complete": True,
                }
            )

        positions = assign_positions(complete_totals, policy)
        values = [e["value"] for e in complete_totals]
        highest = max(values) if values else None
        lowest = min(values) if values else None
        average = _round1(sum(values) / len(values)) if values else None
        subject_stats[sid] = {
            "subject_id": sid,
            "subject": subject.get("name"),
            "sheet_status": sheet.get("status"),
            "entered": len(values),
            "expected": len(students),
            "highest": highest,
            "lowest": lowest,
            "average": average,
        }
        for student in students:
            for result in per_student[student["id"]]:
                if result["subject_id"] == sid:
                    result["position"] = positions.get(student["id"])
                    result["class_highest"] = highest
                    result["class_lowest"] = lowest
                    result["class_average"] = average

    if incomplete_policy == "block" and missing:
        return {
            "blocked": True,
            "reason": "Some students are missing scores",
            "missing": missing,
            "config": snapshot,
            "subjects": list(subject_stats.values()),
            "students": [],
            "class_size": 0,
            "class_average": None,
        }

    rows = []
    for student in students:
        subject_results = per_student[student["id"]]
        complete = all(r["complete"] for r in subject_results)
        totals = [r["total"] for r in subject_results if r["complete"]]
        passed = sum(1 for t in totals if t >= pass_mark)
        total_score = _round1(sum(totals))
        average = _round1(total_score / len(totals)) if totals else 0.0
        rows.append(
            {
                "student_id": student["id"],
                "student": student.get("name"),
                "admission_no": student.get("admission_no"),
                "total_score": total_score,
                "average": average,
                "subjects_offered": len(subject_results),
                "subjects_passed": passed,
                "subjects_failed": len(subject_results) - passed,
                "incomplete": not complete,
                "position": None,
                "subject_results": subject_results,
            }
        )

    ranked = [r for r in rows if not r["incomplete"]]
    positions = assign_positions([{"key": r["student_id"], "value": r["total_score"]} for r in ranked], policy)
    for row in rows:
        row["position"] = positions.get(row["student_id"])

    class_average = _round1(sum(r["average"] for r in ranked) / len(ranked)) if ranked else None

    return {
        "blocked": False,
        "reason": None,
        "missing": missing,
        "config": snapshot,
        "subjects": list(subject_stats.values()),
        "students": rows,
        "class_size": len(ranked),
        "class_average": class_average,
    }
