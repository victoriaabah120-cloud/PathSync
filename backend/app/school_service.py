"""Shared helpers for the School Result Compiler: lookups, audit trail, compilation."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from .results_engine import compile_class, config_snapshot, grade_for, subject_total
from .school_tenancy import SchoolContext, first_row, rows

DEFAULT_SCALE = [
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def full_name(student: dict) -> str:
    parts = [student.get("first_name"), student.get("middle_name"), student.get("last_name")]
    return " ".join(p for p in parts if p)


def audit(db, ctx: SchoolContext, action: str, compilation_id=None, sheet_id=None, detail=None) -> None:
    """Every state change that touches results is recorded."""
    try:
        db.table("src_result_events").insert(
            {
                "school_id": ctx.school_id,
                "compilation_id": compilation_id,
                "sheet_id": sheet_id,
                "actor_user_id": ctx.user.id,
                "action": action,
                "detail": detail or {},
            }
        ).execute()
    except Exception:  # the audit trail must never block the operation itself
        pass


def active_session(db, school_id: str) -> dict:
    session = first_row(
        db.table("src_sessions")
        .select("*")
        .eq("school_id", school_id)
        .eq("is_current", True)
        .limit(1)
    )
    if not session:
        session = first_row(
            db.table("src_sessions").select("*").eq("school_id", school_id).order("created_at", desc=True).limit(1)
        )
    if not session:
        raise HTTPException(status_code=409, detail="Create an academic session first.")
    return session


def active_term(db, school_id: str, session_id: str) -> dict:
    term = first_row(
        db.table("src_terms")
        .select("*")
        .eq("school_id", school_id)
        .eq("session_id", session_id)
        .eq("is_current", True)
        .limit(1)
    )
    if not term:
        term = first_row(
            db.table("src_terms")
            .select("*")
            .eq("session_id", session_id)
            .order("position")
            .limit(1)
        )
    if not term:
        raise HTTPException(status_code=409, detail="Create a term for this session first.")
    return term


def config_for(db, school_id: str, session_id: str, term_id: str | None) -> dict:
    """The newest active assessment config for the term, else the session default, else a default."""
    query = db.table("src_assessment_configs").select("*").eq("school_id", school_id).eq("session_id", session_id)
    if term_id:
        specific = first_row(query.eq("term_id", term_id).eq("is_active", True).order("version", desc=True).limit(1))
        if specific:
            return specific
    shared = first_row(
        db.table("src_assessment_configs")
        .select("*")
        .eq("school_id", school_id)
        .eq("session_id", session_id)
        .is_("term_id", "null")
        .eq("is_active", True)
        .order("version", desc=True)
        .limit(1)
    )
    if shared:
        return shared
    return {
        "id": None,
        "version": 1,
        "ca1_max": 10,
        "ca2_max": 10,
        "ca3_max": 10,
        "exam_max": 70,
        "total_max": 100,
        "pass_mark": 40,
        "grading_scale": DEFAULT_SCALE,
        "rank_policy": "competition",
        "incomplete_policy": "block",
    }


def enrolled_students(db, school_id: str, class_id: str, session_id: str) -> list[dict]:
    enrolments = rows(
        db.table("src_enrolments")
        .select("student_id")
        .eq("school_id", school_id)
        .eq("class_id", class_id)
        .eq("session_id", session_id)
        .eq("status", "active")
    )
    ids = [e["student_id"] for e in enrolments]
    if not ids:
        return []
    students = rows(db.table("src_students").select("*").eq("school_id", school_id).in_("id", ids))
    students.sort(key=lambda s: (str(s.get("last_name") or ""), str(s.get("first_name") or "")))
    for student in students:
        student["name"] = full_name(student)
    return students


def class_subjects(db, school_id: str, session_id: str, class_id: str) -> list[dict]:
    links = rows(
        db.table("src_class_subjects")
        .select("subject_id")
        .eq("school_id", school_id)
        .eq("session_id", session_id)
        .eq("class_id", class_id)
    )
    ids = [link["subject_id"] for link in links]
    if not ids:
        return []
    subjects = rows(db.table("src_subjects").select("*").eq("school_id", school_id).in_("id", ids))
    subjects.sort(key=lambda s: str(s.get("name") or ""))
    return subjects


def teacher_assignments(db, member_id: str, session_id: str | None = None) -> list[dict]:
    query = db.table("src_assignments").select("*").eq("member_id", member_id)
    if session_id:
        query = query.eq("session_id", session_id)
    return rows(query)


def assignment_exists(db, member_id: str, session_id: str, class_id: str, subject_id: str | None, kind: str) -> dict | None:
    query = (
        db.table("src_assignments")
        .select("*")
        .eq("member_id", member_id)
        .eq("session_id", session_id)
        .eq("class_id", class_id)
        .eq("kind", kind)
    )
    if subject_id:
        query = query.eq("subject_id", subject_id)
    else:
        query = query.is_("subject_id", "null")
    return first_row(query.limit(1))


def form_teacher(db, school_id: str, session_id: str, class_id: str) -> dict | None:
    return first_row(
        db.table("src_assignments")
        .select("*")
        .eq("school_id", school_id)
        .eq("session_id", session_id)
        .eq("class_id", class_id)
        .eq("kind", "form")
        .limit(1)
    )


def get_or_create_sheet(db, ctx: SchoolContext, session_id: str, term_id: str, class_id: str, subject_id: str) -> dict:
    sheet = first_row(
        db.table("src_score_sheets")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session_id)
        .eq("term_id", term_id)
        .eq("class_id", class_id)
        .eq("subject_id", subject_id)
        .limit(1)
    )
    if sheet:
        return sheet
    config = config_for(db, ctx.school_id, session_id, term_id)
    payload = {
        "school_id": ctx.school_id,
        "session_id": session_id,
        "term_id": term_id,
        "class_id": class_id,
        "subject_id": subject_id,
        "member_id": ctx.member_id,
        "config_id": config.get("id"),
        "status": "draft",
    }
    created = db.table("src_score_sheets").insert(payload).execute().data or []
    return created[0] if created else payload


def sheet_rows(db, sheet_id: str) -> dict:
    return {row["student_id"]: row for row in rows(db.table("src_scores").select("*").eq("sheet_id", sheet_id))}


def assert_sheet_editable(sheet: dict) -> None:
    if str(sheet.get("status")) in ("submitted", "approved"):
        raise HTTPException(
            status_code=409,
            detail="These scores are already submitted and locked. Ask an administrator to reopen the sheet.",
        )


def compile_and_store(db, ctx: SchoolContext, session_id: str, term_id: str, class_id: str, remark: str = "") -> dict:
    """Run the engine over the class and persist the compilation and its results."""
    config = config_for(db, ctx.school_id, session_id, term_id)
    subjects = class_subjects(db, ctx.school_id, session_id, class_id)
    students = enrolled_students(db, ctx.school_id, class_id, session_id)
    if not subjects:
        raise HTTPException(status_code=409, detail="Add subjects to this class first.")
    if not students:
        raise HTTPException(status_code=409, detail="No students are enrolled in this class yet.")

    sheets = {}
    for subject in subjects:
        sheet = first_row(
            db.table("src_score_sheets")
            .select("*")
            .eq("school_id", ctx.school_id)
            .eq("session_id", session_id)
            .eq("term_id", term_id)
            .eq("class_id", class_id)
            .eq("subject_id", subject["id"])
            .limit(1)
        )
        scores = sheet_rows(db, sheet["id"]) if sheet else {}
        sheets[subject["id"]] = {"status": (sheet or {}).get("status", "missing"), "scores": scores}

    compiled = compile_class(config, subjects, students, sheets)
    compiled["sheets"] = {
        subject["id"]: {
            "subject": subject.get("name"),
            "status": sheets[subject["id"]]["status"],
        }
        for subject in subjects
    }

    if compiled["blocked"]:
        return compiled

    existing = first_row(
        db.table("src_compilations")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session_id)
        .eq("term_id", term_id)
        .eq("class_id", class_id)
        .limit(1)
    )
    if existing and str(existing.get("status")) == "published":
        raise HTTPException(status_code=409, detail="These results are published and locked. Reopen them first.")

    payload = {
        "school_id": ctx.school_id,
        "session_id": session_id,
        "term_id": term_id,
        "class_id": class_id,
        "status": "draft",
        "config_snapshot": compiled["config"],
        "class_size": compiled["class_size"],
        "class_average": compiled["class_average"],
        "compiled_by": ctx.user.id,
        "compiled_at": now_iso(),
        "form_teacher_remark": remark or (existing or {}).get("form_teacher_remark") or "",
    }
    if existing:
        db.table("src_compilations").update(payload).eq("id", existing["id"]).execute()
        compilation = {**existing, **payload}
    else:
        created = db.table("src_compilations").insert(payload).execute().data or []
        compilation = created[0] if created else payload

    db.table("src_compiled_results").delete().eq("compilation_id", compilation["id"]).execute()
    result_rows = [
        {
            "compilation_id": compilation["id"],
            "school_id": ctx.school_id,
            "student_id": row["student_id"],
            "total_score": row["total_score"],
            "average": row["average"],
            "subjects_offered": row["subjects_offered"],
            "subjects_passed": row["subjects_passed"],
            "subjects_failed": row["subjects_failed"],
            "position": row["position"],
            "incomplete": row["incomplete"],
            "subject_results": row["subject_results"],
        }
        for row in compiled["students"]
    ]
    if result_rows:
        db.table("src_compiled_results").insert(result_rows).execute()

    audit(db, ctx, "compiled", compilation_id=compilation["id"], detail={"class_size": compiled["class_size"]})
    compiled["compilation"] = compilation
    return compiled


def report_payload(db, school: dict, compilation: dict, result: dict, student: dict, term: dict, session: dict, class_row: dict) -> dict:
    """Everything a report card renders, from stored data only."""
    return {
        "school": {
            "id": school["id"],
            "name": school.get("name"),
            "address": school.get("address"),
            "city": school.get("city"),
            "state": school.get("state"),
            "phone": school.get("phone"),
            "email": school.get("email"),
        },
        "student": {
            "id": student["id"],
            "name": full_name(student),
            "admission_no": student.get("admission_no"),
            "gender": student.get("gender"),
        },
        "class": class_row.get("name"),
        "session": session.get("name"),
        "term": term.get("name"),
        "status": compilation.get("status"),
        "published_at": compilation.get("published_at"),
        "config": compilation.get("config_snapshot"),
        "subjects": result.get("subject_results") or [],
        "total_score": result.get("total_score"),
        "average": result.get("average"),
        "subjects_offered": result.get("subjects_offered"),
        "subjects_passed": result.get("subjects_passed"),
        "subjects_failed": result.get("subjects_failed"),
        "position": result.get("position"),
        "class_size": compilation.get("class_size"),
        "incomplete": result.get("incomplete"),
        "form_teacher_remark": compilation.get("form_teacher_remark"),
        "principal_remark": result.get("principal_remark"),
        "attendance": {"present": result.get("attendance_present"), "total": result.get("attendance_total")},
    }


def grade_preview(config: dict, row: dict) -> dict:
    total = subject_total(row)
    return {"total": total, **grade_for(total, config_snapshot(config)["grading_scale"])}
