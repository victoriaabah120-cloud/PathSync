"""Teacher side: responsibilities, score entry, submission and form-teacher compilation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_supabase
from ..results_engine import grade_for, row_is_complete, subject_total, validate_row
from ..school_schemas import ReasonBody, ScoresSave, SheetCreate
from ..school_service import (
    active_session,
    active_term,
    assert_sheet_editable,
    assignment_exists,
    audit,
    class_subjects,
    compile_and_store,
    config_for,
    enrolled_students,
    form_teacher,
    full_name,
    get_or_create_sheet,
    now_iso,
    sheet_rows,
)
from ..school_tenancy import (
    SCHOOL_ADMIN,
    SchoolContext,
    ensure_active_subscription,
    first_row,
    require_staff,
    rows,
)

router = APIRouter(tags=["school-teaching"])


def _sheet(db, ctx: SchoolContext, sheet_id: str) -> dict:
    sheet = first_row(
        db.table("src_score_sheets").select("*").eq("id", sheet_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not sheet:
        raise HTTPException(status_code=404, detail="That score sheet is not in this school.")
    if ctx.is_admin:
        return sheet
    if ctx.role != "teacher":
        raise HTTPException(status_code=403, detail="Only staff can open score sheets.")
    teaches = assignment_exists(db, ctx.member_id, sheet["session_id"], sheet["class_id"], sheet["subject_id"], "subject")
    is_form = form_teacher(db, ctx.school_id, sheet["session_id"], sheet["class_id"])
    if not teaches and not (is_form and is_form.get("member_id") == ctx.member_id):
        raise HTTPException(status_code=403, detail="This class and subject are not assigned to you.")
    return sheet


def _session_in_school(db, ctx: SchoolContext, session_id: str | None) -> dict:
    """The named session, or the active one. Always scoped to the caller's school."""
    if not session_id:
        return active_session(db, ctx.school_id)
    session = first_row(
        db.table("src_sessions").select("*").eq("id", session_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not session:
        raise HTTPException(status_code=404, detail="That session is not in this school.")
    return session


def _term_in_school(db, ctx: SchoolContext, session_id: str, term_id: str | None) -> dict:
    """The named term of that session, or the session's current term."""
    if not term_id:
        return active_term(db, ctx.school_id, session_id)
    term = first_row(
        db.table("src_terms")
        .select("*")
        .eq("id", term_id)
        .eq("school_id", ctx.school_id)
        .eq("session_id", session_id)
        .limit(1)
    )
    if not term:
        raise HTTPException(status_code=404, detail="That term is not in this session.")
    return term


def _require_form_teacher(db, ctx: SchoolContext, session_id: str, class_id: str) -> None:
    if ctx.is_admin:
        return
    assigned = form_teacher(db, ctx.school_id, session_id, class_id)
    if not assigned or assigned.get("member_id") != ctx.member_id:
        raise HTTPException(status_code=403, detail="You are not the form teacher of this class.")


@router.get("/schools/me/responsibilities")
def responsibilities(ctx: SchoolContext = Depends(require_staff)):
    """Everything assigned to this one account, subject and form teacher alike."""
    db = get_supabase()
    session = active_session(db, ctx.school_id)
    term = active_term(db, ctx.school_id, session["id"])
    classes = {c["id"]: c for c in rows(db.table("src_classes").select("*").eq("school_id", ctx.school_id))}
    subjects = {s["id"]: s for s in rows(db.table("src_subjects").select("*").eq("school_id", ctx.school_id))}

    if ctx.is_admin:
        assignments = rows(
            db.table("src_assignments").select("*").eq("school_id", ctx.school_id).eq("session_id", session["id"])
        )
    else:
        assignments = rows(
            db.table("src_assignments").select("*").eq("member_id", ctx.member_id).eq("session_id", session["id"])
        )

    sheets = {
        (s["class_id"], s["subject_id"]): s
        for s in rows(
            db.table("src_score_sheets")
            .select("*")
            .eq("school_id", ctx.school_id)
            .eq("session_id", session["id"])
            .eq("term_id", term["id"])
        )
    }
    members = {m["id"]: m for m in rows(db.table("src_school_members").select("*").eq("school_id", ctx.school_id))}

    subject_roles = []
    form_roles = []
    for assignment in assignments:
        klass = classes.get(assignment["class_id"], {})
        sheet = sheets.get((assignment["class_id"], assignment.get("subject_id")))
        entry = {
            "assignment_id": assignment["id"],
            "kind": assignment["kind"],
            "class_id": assignment["class_id"],
            "class_name": klass.get("name"),
            "subject_id": assignment.get("subject_id"),
            "subject_name": (subjects.get(assignment.get("subject_id")) or {}).get("name"),
            "sheet_id": (sheet or {}).get("id"),
            "sheet_status": (sheet or {}).get("status", "not_started"),
            "students": len(enrolled_students(db, ctx.school_id, assignment["class_id"], session["id"])),
        }
        if assignment["kind"] == "subject":
            subject_roles.append(entry)
        else:
            form_roles.append(entry)

    return {
        "session": session,
        "term": term,
        "subject_roles": subject_roles,
        "form_roles": form_roles,
        "teachers": [
            {"id": m["id"], "email": m.get("invited_email"), "status": m.get("status")}
            for m in members.values()
            if m.get("role") == "teacher"
        ],
    }


@router.post("/schools/me/sheets")
def create_sheet(body: SheetCreate, ctx: SchoolContext = Depends(require_staff)):
    """Open the score sheet for one class and subject, or return the one already there.

    A sheet is the unit of work a subject teacher fills in, so it is created on
    demand: the dashboard lists the assignments, and the first visit to a sheet
    creates the row. Only the teacher assigned to that class and subject (or the
    administrator) may open it, and only while the school is subscribed.
    """
    db = get_supabase()
    ensure_active_subscription(ctx)

    session = first_row(
        db.table("src_sessions").select("*").eq("id", body.session_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not session:
        raise HTTPException(status_code=404, detail="That session is not in this school.")
    term = first_row(
        db.table("src_terms")
        .select("*")
        .eq("id", body.term_id)
        .eq("school_id", ctx.school_id)
        .eq("session_id", session["id"])
        .limit(1)
    )
    if not term:
        raise HTTPException(status_code=404, detail="That term is not in this session.")
    klass = first_row(
        db.table("src_classes").select("*").eq("id", body.class_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not klass:
        raise HTTPException(status_code=404, detail="That class is not in this school.")
    subject = first_row(
        db.table("src_subjects").select("*").eq("id", body.subject_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not subject:
        raise HTTPException(status_code=404, detail="That subject is not in this school.")

    offered = class_subjects(db, ctx.school_id, session["id"], klass["id"])
    if subject["id"] not in {item["id"] for item in offered}:
        raise HTTPException(status_code=422, detail="That subject is not offered by this class in this session.")

    if not ctx.is_admin:
        teaches = assignment_exists(db, ctx.member_id, session["id"], klass["id"], subject["id"], "subject")
        is_form = form_teacher(db, ctx.school_id, session["id"], klass["id"])
        if not teaches and not (is_form and is_form.get("member_id") == ctx.member_id):
            raise HTTPException(status_code=403, detail="This class and subject are not assigned to you.")

    existing = first_row(
        db.table("src_score_sheets")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session["id"])
        .eq("term_id", term["id"])
        .eq("class_id", klass["id"])
        .eq("subject_id", subject["id"])
        .limit(1)
    )
    if existing:
        return {"sheet": existing, "created": False}

    sheet = get_or_create_sheet(db, ctx, session["id"], term["id"], klass["id"], subject["id"])
    audit(db, ctx, "sheet_opened", sheet_id=sheet.get("id"), detail={"subject": subject.get("name")})
    return {"sheet": sheet, "created": True}


@router.get("/schools/me/sheets/{sheet_id}")
def get_sheet(sheet_id: str, ctx: SchoolContext = Depends(require_staff)):
    """The score grid: enrolled students, saved scores and the configured maxima."""
    db = get_supabase()
    sheet = _sheet(db, ctx, sheet_id)
    config = config_for(db, ctx.school_id, sheet["session_id"], sheet["term_id"])
    students = enrolled_students(db, ctx.school_id, sheet["class_id"], sheet["session_id"])
    saved = sheet_rows(db, sheet["id"])
    subject = first_row(db.table("src_subjects").select("*").eq("id", sheet["subject_id"]).limit(1))
    klass = first_row(db.table("src_classes").select("*").eq("id", sheet["class_id"]).limit(1))

    rows_out = []
    missing = 0
    for student in students:
        row = saved.get(student["id"]) or {}
        complete = row_is_complete(row)
        if not complete:
            missing += 1
        total = subject_total(row)
        graded = grade_for(total, config.get("grading_scale") or [])
        rows_out.append(
            {
                "student_id": student["id"],
                "name": full_name(student),
                "admission_no": student.get("admission_no"),
                "ca1": row.get("ca1"),
                "ca2": row.get("ca2"),
                "ca3": row.get("ca3"),
                "exam": row.get("exam"),
                "total": total,
                "grade": graded["grade"],
                "remark": graded["remark"],
                "complete": complete,
            }
        )

    return {
        "sheet": sheet,
        "subject": subject,
        "class": klass,
        "term": first_row(db.table("src_terms").select("*").eq("id", sheet["term_id"]).limit(1)),
        "session": first_row(db.table("src_sessions").select("*").eq("id", sheet["session_id"]).limit(1)),
        "config": config,
        "students": rows_out,
        "missing": missing,
        "locked": str(sheet.get("status")) in ("submitted", "approved"),
    }


@router.put("/schools/me/sheets/{sheet_id}/scores")
def save_scores(sheet_id: str, body: ScoresSave, ctx: SchoolContext = Depends(require_staff)):
    """Save a draft. Values are validated against the configured maxima."""
    db = get_supabase()
    sheet = _sheet(db, ctx, sheet_id)
    assert_sheet_editable(sheet)
    ensure_active_subscription(ctx)

    config = config_for(db, ctx.school_id, sheet["session_id"], sheet["term_id"])
    allowed = {s["id"] for s in enrolled_students(db, ctx.school_id, sheet["class_id"], sheet["session_id"])}
    problems = []
    cleaned = []
    for row in body.rows:
        if row.student_id not in allowed:
            problems.append(f"{row.student_id} is not enrolled in this class")
            continue
        payload = row.model_dump()
        issues = validate_row(payload, config)
        if issues:
            problems.append(f"{row.student_id}: " + "; ".join(issues))
            continue
        total = subject_total(payload)
        graded = grade_for(total, config.get("grading_scale") or [])
        cleaned.append(
            {
                "school_id": ctx.school_id,
                "sheet_id": sheet["id"],
                "student_id": row.student_id,
                "ca1": payload["ca1"],
                "ca2": payload["ca2"],
                "ca3": payload["ca3"],
                "exam": payload["exam"],
                "total": total,
                "grade": graded["grade"],
                "remark": graded["remark"],
                "updated_by": ctx.user.id,
                "updated_at": now_iso(),
            }
        )
    if problems:
        raise HTTPException(status_code=422, detail={"message": "Some scores are not valid.", "problems": problems})

    for payload in cleaned:
        existing = first_row(
            db.table("src_scores").select("*").eq("sheet_id", sheet["id"]).eq("student_id", payload["student_id"]).limit(1)
        )
        if existing:
            db.table("src_scores").update(payload).eq("id", existing["id"]).execute()
        else:
            db.table("src_scores").insert(payload).execute()

    db.table("src_score_sheets").update(
        {"member_id": sheet.get("member_id") or ctx.member_id, "config_id": config.get("id"), "updated_at": now_iso()}
    ).eq("id", sheet["id"]).execute()
    return {"saved": len(cleaned), "sheet_id": sheet["id"]}


@router.post("/schools/me/sheets/{sheet_id}/submit")
def submit_sheet(sheet_id: str, ctx: SchoolContext = Depends(require_staff)):
    """Hand the subject over for compilation. Incomplete sheets are refused."""
    db = get_supabase()
    sheet = _sheet(db, ctx, sheet_id)
    assert_sheet_editable(sheet)
    ensure_active_subscription(ctx)

    students = enrolled_students(db, ctx.school_id, sheet["class_id"], sheet["session_id"])
    if not students:
        raise HTTPException(status_code=409, detail="This class has no students yet.")
    saved = sheet_rows(db, sheet["id"])
    missing = [full_name(s) for s in students if not row_is_complete(saved.get(s["id"]) or {})]
    if missing:
        raise HTTPException(
            status_code=409,
            detail={"message": "Every student needs a complete score before submitting.", "missing": missing},
        )

    patch = {"status": "submitted", "submitted_at": now_iso(), "submitted_by": ctx.user.id, "return_reason": None}
    db.table("src_score_sheets").update(patch).eq("id", sheet["id"]).execute()
    audit(db, ctx, "scores_submitted", sheet_id=sheet["id"], detail={"students": len(students)})
    return {"sheet": {**sheet, **patch}}


@router.post("/schools/me/sheets/{sheet_id}/return")
def return_sheet(sheet_id: str, body: ReasonBody, ctx: SchoolContext = Depends(require_staff)):
    """A form teacher (or administrator) returns a submitted sheet for correction."""
    db = get_supabase()
    sheet = _sheet(db, ctx, sheet_id)
    if str(sheet.get("status")) != "submitted":
        raise HTTPException(status_code=409, detail="Only a submitted sheet can be returned.")
    _require_form_teacher(db, ctx, sheet["session_id"], sheet["class_id"])
    patch = {"status": "returned", "return_reason": body.reason or "Returned for correction", "updated_at": now_iso()}
    db.table("src_score_sheets").update(patch).eq("id", sheet["id"]).execute()
    audit(db, ctx, "sheet_returned", sheet_id=sheet["id"], detail={"reason": body.reason})
    return {"sheet": {**sheet, **patch}}


@router.post("/schools/me/classes/{class_id}/compile")
def compile_class_view(
    class_id: str,
    session_id: str | None = None,
    term_id: str | None = None,
    remark: str = "",
    ctx: SchoolContext = Depends(require_staff),
):
    """Compile the class. Blocked while any subject still has missing scores."""
    db = get_supabase()
    session = _session_in_school(db, ctx, session_id)
    term = _term_in_school(db, ctx, session["id"], term_id)
    _require_form_teacher(db, ctx, session["id"], class_id)
    ensure_active_subscription(ctx)

    compiled = compile_and_store(db, ctx, session["id"], term["id"], class_id, remark)
    if compiled.get("blocked"):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Results cannot be compiled while scores are missing.",
                "missing": compiled["missing"][:60],
                "subjects": compiled["subjects"],
            },
        )
    return compiled


@router.post("/schools/me/classes/{class_id}/submit-results")
def submit_results(
    class_id: str,
    session_id: str | None = None,
    term_id: str | None = None,
    ctx: SchoolContext = Depends(require_staff),
):
    """Form teacher sends the compiled class to the school administrator."""
    db = get_supabase()
    session = _session_in_school(db, ctx, session_id)
    term = _term_in_school(db, ctx, session["id"], term_id)
    _require_form_teacher(db, ctx, session["id"], class_id)

    compilation = first_row(
        db.table("src_compilations")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session["id"])
        .eq("term_id", term["id"])
        .eq("class_id", class_id)
        .limit(1)
    )
    if not compilation:
        raise HTTPException(status_code=409, detail="Compile the class before submitting it.")
    if str(compilation.get("status")) not in ("draft", "returned"):
        raise HTTPException(status_code=409, detail="These results are already with the administrator.")

    patch = {"status": "submitted", "submitted_by": ctx.user.id, "submitted_at": now_iso(), "updated_at": now_iso()}
    db.table("src_compilations").update(patch).eq("id", compilation["id"]).execute()
    audit(db, ctx, "results_submitted", compilation_id=compilation["id"])
    return {"compilation": {**compilation, **patch}}


@router.get("/schools/me/classes/{class_id}/results")
def class_results(
    class_id: str,
    session_id: str | None = None,
    term_id: str | None = None,
    ctx: SchoolContext = Depends(require_staff),
):
    """Compiled results for a class, for the form teacher, admin and class result sheet."""
    db = get_supabase()
    session = _session_in_school(db, ctx, session_id)
    term = _term_in_school(db, ctx, session["id"], term_id)
    _require_form_teacher(db, ctx, session["id"], class_id)

    compilation = first_row(
        db.table("src_compilations")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session["id"])
        .eq("term_id", term["id"])
        .eq("class_id", class_id)
        .limit(1)
    )
    if not compilation:
        return {"compilation": None, "results": [], "subjects": class_subjects(db, ctx.school_id, session["id"], class_id)}

    results = rows(
        db.table("src_compiled_results").select("*").eq("compilation_id", compilation["id"]).order("position")
    )
    student_ids = [r["student_id"] for r in results]
    students = {}
    if student_ids:
        for student in rows(db.table("src_students").select("*").eq("school_id", ctx.school_id).in_("id", student_ids)):
            students[student["id"]] = {**student, "name": full_name(student)}
    for result in results:
        result["student"] = students.get(result["student_id"])

    sheets = rows(
        db.table("src_score_sheets")
        .select("subject_id,status")
        .eq("school_id", ctx.school_id)
        .eq("session_id", session["id"])
        .eq("term_id", term["id"])
        .eq("class_id", class_id)
    )
    subjects = class_subjects(db, ctx.school_id, session["id"], class_id)
    status_by_subject = {s["subject_id"]: s["status"] for s in sheets}
    for subject in subjects:
        subject["sheet_status"] = status_by_subject.get(subject["id"], "not_started")

    return {
        "compilation": compilation,
        "results": results,
        "subjects": subjects,
        "class": first_row(db.table("src_classes").select("*").eq("id", class_id).limit(1)),
        "session": session,
        "term": term,
    }
