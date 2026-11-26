"""Student side: only their own published results, never anyone else's."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_supabase
from ..school_service import active_session, active_term, full_name, report_payload
from ..school_tenancy import SchoolContext, first_row, require_student, rows

router = APIRouter(tags=["school-student"])


def _my_student(db, ctx: SchoolContext) -> dict:
    student = first_row(
        db.table("src_students").select("*").eq("school_id", ctx.school_id).eq("user_id", ctx.user.id).limit(1)
    )
    if not student:
        raise HTTPException(status_code=404, detail="No student record is linked to this account yet.")
    return student


@router.get("/schools/me/student")
def my_student_profile(ctx: SchoolContext = Depends(require_student)):
    """Profile, class and the published terms this student can open."""
    db = get_supabase()
    student = _my_student(db, ctx)
    session = active_session(db, ctx.school_id)
    enrolment = first_row(
        db.table("src_enrolments")
        .select("*")
        .eq("student_id", student["id"])
        .eq("session_id", session["id"])
        .limit(1)
    )
    klass = first_row(db.table("src_classes").select("*").eq("id", enrolment["class_id"]).limit(1)) if enrolment else None

    published = rows(
        db.table("src_compiled_results")
        .select("compilation_id")
        .eq("school_id", ctx.school_id)
        .eq("student_id", student["id"])
    )
    compilation_ids = [p["compilation_id"] for p in published]
    results = []
    if compilation_ids:
        for compilation in rows(
            db.table("src_compilations")
            .select("*")
            .eq("school_id", ctx.school_id)
            .eq("status", "published")
            .in_("id", compilation_ids)
            .order("published_at", desc=True)
        ):
            term = first_row(db.table("src_terms").select("*").eq("id", compilation["term_id"]).limit(1))
            comp_session = first_row(db.table("src_sessions").select("*").eq("id", compilation["session_id"]).limit(1))
            results.append(
                {
                    "compilation_id": compilation["id"],
                    "term": (term or {}).get("name"),
                    "session": (comp_session or {}).get("name"),
                    "published_at": compilation.get("published_at"),
                }
            )

    return {
        "student": {**student, "name": full_name(student)},
        "class": klass,
        "session": session,
        "results": results,
    }


@router.get("/schools/me/results")
def my_results(ctx: SchoolContext = Depends(require_student)):
    db = get_supabase()
    student = _my_student(db, ctx)
    mine = rows(
        db.table("src_compiled_results")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("student_id", student["id"])
    )
    if not mine:
        return {"results": []}
    published_ids = [
        c["id"]
        for c in rows(
            db.table("src_compilations")
            .select("id")
            .eq("school_id", ctx.school_id)
            .eq("status", "published")
            .in_("id", [m["compilation_id"] for m in mine])
        )
    ]
    output = []
    for result in mine:
        if result["compilation_id"] not in published_ids:
            continue
        compilation = first_row(db.table("src_compilations").select("*").eq("id", result["compilation_id"]).limit(1))
        term = first_row(db.table("src_terms").select("*").eq("id", compilation["term_id"]).limit(1))
        output.append(
            {
                "compilation_id": result["compilation_id"],
                "term": (term or {}).get("name"),
                "total_score": result["total_score"],
                "average": result["average"],
                "position": result["position"],
                "class_size": compilation.get("class_size"),
                "subjects_offered": result["subjects_offered"],
            }
        )
    return {"results": output}


@router.get("/schools/me/results/{compilation_id}")
def my_report(compilation_id: str, ctx: SchoolContext = Depends(require_student)):
    """A full report card, only for this student and only once published."""
    db = get_supabase()
    student = _my_student(db, ctx)
    compilation = first_row(
        db.table("src_compilations")
        .select("*")
        .eq("id", compilation_id)
        .eq("school_id", ctx.school_id)
        .limit(1)
    )
    if not compilation:
        raise HTTPException(status_code=404, detail="That result is not available.")
    if str(compilation.get("status")) != "published":
        raise HTTPException(status_code=403, detail="These results have not been published yet.")

    result = first_row(
        db.table("src_compiled_results")
        .select("*")
        .eq("compilation_id", compilation_id)
        .eq("student_id", student["id"])
        .limit(1)
    )
    if not result:
        raise HTTPException(status_code=403, detail="That result belongs to another student.")

    term = first_row(db.table("src_terms").select("*").eq("id", compilation["term_id"]).limit(1))
    session = first_row(db.table("src_sessions").select("*").eq("id", compilation["session_id"]).limit(1))
    klass = first_row(db.table("src_classes").select("*").eq("id", compilation["class_id"]).limit(1))
    return report_payload(db, ctx.school, compilation, result, student, term or {}, session or {}, klass or {})
