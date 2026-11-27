"""School administration: structure, students, teachers, assignments and approvals."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user, get_supabase
from ..school_import import rows_from_photograph, rows_from_spreadsheet
from ..subject_library import search as search_library
from ..school_schemas import (
    AssignmentCreate,
    ClassCreate,
    ClassSubjectCreate,
    ConfigCreate,
    JoinSchool,
    ReasonBody,
    SessionCreate,
    RegisterPhoto,
    RegisterUpload,
    StudentBulkImport,
    StudentCreate,
    TeacherCreate,
    StudentUpdate,
    SubjectCreate,
    TeacherInvite,
    TermCreate,
)
from ..school_service import (
    DEFAULT_SCALE,
    active_session,
    audit,
    class_subjects,
    enrolled_students,
    full_name,
    now_iso,
)
from ..school_tenancy import (
    SchoolContext,
    ensure_capacity,
    first_row,
    get_school_context,
    require_admin,
    rows,
)

router = APIRouter(tags=["school-admin"])


def _one(payload: list) -> dict:
    if not payload:
        raise HTTPException(status_code=502, detail="That could not be saved. Please try again.")
    return payload[0]


@router.post("/schools/me/join")
def join_school(body: JoinSchool, user=Depends(get_current_user)):
    """Activate a teacher or student invitation with the code the school sent."""
    db = get_supabase()
    code = body.invite_code.strip()
    email = (getattr(user, "email", "") or "").lower()

    member = first_row(db.table("src_school_members").select("*").eq("invite_code", code).limit(1))
    if member:
        if member.get("status") == "active":
            raise HTTPException(status_code=409, detail="This invitation has already been used.")
        invited = (member.get("invited_email") or "").lower()
        if invited and invited != email:
            raise HTTPException(status_code=403, detail="This invitation was sent to a different email address.")
        updated = _one(
            db.table("src_school_members")
            .update({"user_id": user.id, "status": "active", "activated_at": now_iso()})
            .eq("id", member["id"])
            .execute()
            .data
        )
        return {"role": updated.get("role"), "school_id": updated.get("school_id"), "member": updated}

    student = first_row(db.table("src_students").select("*").eq("invite_code", code).limit(1))
    if student:
        if student.get("user_id"):
            raise HTTPException(status_code=409, detail="This invitation has already been used.")
        guardian_email = (student.get("guardian_email") or "").lower()
        if guardian_email and guardian_email != email:
            raise HTTPException(status_code=403, detail="This invitation was sent to a different email address.")
        db.table("src_students").update({"user_id": user.id, "invite_code": None}).eq("id", student["id"]).execute()
        created = _one(
            db.table("src_school_members")
            .insert(
                {
                    "school_id": student["school_id"],
                    "user_id": user.id,
                    "role": "student",
                    "status": "active",
                    "activated_at": now_iso(),
                    "invited_email": email,
                }
            )
            .execute()
            .data
        )
        return {"role": "student", "school_id": student["school_id"], "member": created, "student": student}

    raise HTTPException(status_code=404, detail="That invitation code is not valid.")


# ---------------------------------------------------------------------------
# Academic structure
# ---------------------------------------------------------------------------
@router.post("/schools/me/sessions")
def create_session(body: SessionCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    if body.is_current:
        for current in rows(db.table("src_sessions").select("*").eq("school_id", ctx.school_id).eq("is_current", True)):
            db.table("src_sessions").update({"is_current": False}).eq("id", current["id"]).execute()
    created = _one(
        db.table("src_sessions")
        .insert(
            {
                "school_id": ctx.school_id,
                "name": body.name.strip(),
                "starts_on": body.starts_on.isoformat() if body.starts_on else None,
                "ends_on": body.ends_on.isoformat() if body.ends_on else None,
                "is_current": body.is_current,
            }
        )
        .execute()
        .data
    )
    return {"session": created}


@router.get("/schools/me/sessions")
def list_sessions(ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    return {"sessions": rows(db.table("src_sessions").select("*").eq("school_id", ctx.school_id).order("created_at"))}


@router.post("/schools/me/terms")
def create_term(body: TermCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    if body.is_current:
        for current in rows(
            db.table("src_terms").select("*").eq("session_id", body.session_id).eq("is_current", True)
        ):
            db.table("src_terms").update({"is_current": False}).eq("id", current["id"]).execute()
    created = _one(
        db.table("src_terms")
        .insert(
            {
                "school_id": ctx.school_id,
                "session_id": body.session_id,
                "name": body.name.strip(),
                "position": body.position,
                "starts_on": body.starts_on.isoformat() if body.starts_on else None,
                "ends_on": body.ends_on.isoformat() if body.ends_on else None,
                "is_current": body.is_current,
            }
        )
        .execute()
        .data
    )
    return {"term": created}


@router.get("/schools/me/terms")
def list_terms(ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    return {"terms": rows(db.table("src_terms").select("*").eq("school_id", ctx.school_id).order("position"))}


@router.post("/schools/me/classes")
def create_class(body: ClassCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    created = _one(
        db.table("src_classes")
        .insert({"school_id": ctx.school_id, "name": body.name.strip(), "level": body.level.strip()})
        .execute()
        .data
    )
    return {"class": created}


@router.get("/schools/me/classes")
def list_classes(ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    classes = rows(db.table("src_classes").select("*").eq("school_id", ctx.school_id).order("name"))
    session = active_session(db, ctx.school_id)
    for klass in classes:
        klass["students"] = len(enrolled_students(db, ctx.school_id, klass["id"], session["id"]))
    return {"classes": classes, "session": session}


@router.post("/schools/me/subjects")
def create_subject(body: SubjectCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    created = _one(
        db.table("src_subjects")
        .insert({"school_id": ctx.school_id, "name": body.name.strip(), "code": body.code.strip()})
        .execute()
        .data
    )
    return {"subject": created}


@router.get("/schools/subject-library")
def subject_library(query: str = "", ctx: SchoolContext = Depends(get_school_context)):
    """The built-in subject list, with a flag for the ones this school already has.

    Search matches the name or the code, so typing "math" or "MTH" finds Mathematics.
    """
    db = get_supabase()
    mine = rows(db.table("src_subjects").select("name").eq("school_id", ctx.school_id))
    taken = {row.get("name") for row in mine}
    return {"subjects": search_library(query, taken)}


@router.get("/schools/me/subjects")
def list_subjects(ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    return {"subjects": rows(db.table("src_subjects").select("*").eq("school_id", ctx.school_id).order("name"))}


@router.post("/schools/me/class-subjects")
def add_class_subject(body: ClassSubjectCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    existing = first_row(
        db.table("src_class_subjects")
        .select("*")
        .eq("session_id", body.session_id)
        .eq("class_id", body.class_id)
        .eq("subject_id", body.subject_id)
        .limit(1)
    )
    if existing:
        return {"class_subject": existing, "created": False}
    created = _one(
        db.table("src_class_subjects")
        .insert(
            {
                "school_id": ctx.school_id,
                "session_id": body.session_id,
                "class_id": body.class_id,
                "subject_id": body.subject_id,
            }
        )
        .execute()
        .data
    )
    return {"class_subject": created, "created": True}


@router.get("/schools/me/class-subjects")
def list_class_subjects(session_id: str, class_id: str, ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    return {"subjects": class_subjects(db, ctx.school_id, session_id, class_id)}


# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------
@router.post("/schools/me/students/parse-register")
def parse_register(body: RegisterUpload, ctx: SchoolContext = Depends(require_admin)):
    """Read a spreadsheet register into rows for review. Saves nothing."""
    return rows_from_spreadsheet(body.filename, body.content_base64)


@router.post("/schools/me/students/scan-register")
def scan_register(body: RegisterPhoto, ctx: SchoolContext = Depends(require_admin)):
    """Read a photographed handwritten register into rows for review. Saves nothing."""
    return rows_from_photograph(body.image_base64, body.mime_type)


@router.post("/schools/me/students/import")
def import_students(body: StudentBulkImport, ctx: SchoolContext = Depends(require_admin)):
    """Register reviewed rows in one go.

    Students already in the school (same admission number, or the same full name) are
    skipped and reported rather than duplicated. A blank admission number is filled
    with the next free ADM number and the response says so, so nothing is invented
    quietly.
    """
    db = get_supabase()
    klass = first_row(
        db.table("src_classes").select("*").eq("id", body.class_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not klass:
        raise HTTPException(status_code=404, detail="That class is not in this school.")
    ensure_capacity(ctx, adding=len(body.students))

    session_id = body.session_id or active_session(db, ctx.school_id)["id"]
    existing = rows(db.table("src_students").select("id,admission_no,first_name,last_name").eq("school_id", ctx.school_id))
    taken_admissions = {str(row.get("admission_no") or "").strip().lower() for row in existing}
    taken_names = {
        " ".join(filter(None, [row.get("first_name"), row.get("last_name")])).strip().lower() for row in existing
    }

    created, skipped, assigned = [], [], 0
    counter = len(existing) + 1
    for row in body.students:
        name = " ".join(filter(None, [row.first_name.strip(), row.last_name.strip()])).strip()
        key = name.lower()
        admission = row.admission_no.strip()
        if admission and admission.lower() in taken_admissions:
            skipped.append({"name": name, "reason": "Admission number already used"})
            continue
        if key in taken_names:
            skipped.append({"name": name, "reason": "Already registered"})
            continue
        if not admission:
            while f"adm-{counter:04d}" in taken_admissions:
                counter += 1
            admission = f"ADM-{counter:04d}"
            counter += 1
            assigned += 1
        student = _one(
            db.table("src_students")
            .insert(
                {
                    "school_id": ctx.school_id,
                    "admission_no": admission,
                    "first_name": row.first_name.strip(),
                    "last_name": row.last_name.strip(),
                    "middle_name": row.middle_name.strip(),
                    "invite_code": secrets.token_urlsafe(8),
                    "status": "active",
                }
            )
            .execute()
            .data
        )
        db.table("src_enrolments").insert(
            {
                "school_id": ctx.school_id,
                "student_id": student["id"],
                "class_id": body.class_id,
                "session_id": session_id,
                "status": "active",
            }
        ).execute()
        taken_admissions.add(admission.lower())
        taken_names.add(key)
        student["name"] = full_name(student)
        created.append(student)
    return {
        "created": created,
        "skipped": skipped,
        "assigned_admissions": assigned,
        "class": {"id": klass["id"], "name": klass["name"]},
    }


@router.post("/schools/me/students")
def create_student(body: StudentCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    ensure_capacity(ctx, adding=1)

    session_id = body.session_id or active_session(db, ctx.school_id)["id"]
    student = _one(
        db.table("src_students")
        .insert(
            {
                "school_id": ctx.school_id,
                "admission_no": body.admission_no.strip(),
                "first_name": body.first_name.strip(),
                "last_name": body.last_name.strip(),
                "middle_name": body.middle_name.strip(),
                "gender": body.gender or None,
                "date_of_birth": body.date_of_birth.isoformat() if body.date_of_birth else None,
                "guardian_name": body.guardian_name.strip(),
                "guardian_phone": body.guardian_phone.strip(),
                "guardian_email": body.guardian_email.strip(),
                "invite_code": secrets.token_urlsafe(8),
                "status": "active",
            }
        )
        .execute()
        .data
    )
    if body.class_id:
        db.table("src_enrolments").insert(
            {
                "school_id": ctx.school_id,
                "student_id": student["id"],
                "class_id": body.class_id,
                "session_id": session_id,
                "status": "active",
            }
        ).execute()
    student["name"] = full_name(student)
    return {"student": student}


@router.get("/schools/me/students")
def list_students(ctx: SchoolContext = Depends(get_school_context), class_id: str | None = None):
    db = get_supabase()
    session = active_session(db, ctx.school_id)
    students = rows(db.table("src_students").select("*").eq("school_id", ctx.school_id).order("last_name"))
    enrolments = rows(
        db.table("src_enrolments").select("*").eq("school_id", ctx.school_id).eq("session_id", session["id"])
    )
    class_ids = {}
    for klass in rows(db.table("src_classes").select("*").eq("school_id", ctx.school_id)):
        class_ids[klass["id"]] = klass["name"]
    by_student = {e["student_id"]: e for e in enrolments}
    output = []
    for student in students:
        enrolment = by_student.get(student["id"])
        student["name"] = full_name(student)
        student["class_id"] = (enrolment or {}).get("class_id")
        student["class_name"] = class_ids.get(student["class_id"]) if student.get("class_id") else None
        if class_id and student.get("class_id") != class_id:
            continue
        output.append(student)
    return {"students": output, "session": session}


@router.patch("/schools/me/students/{student_id}")
def update_student(student_id: str, body: StudentUpdate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    student = first_row(
        db.table("src_students").select("*").eq("id", student_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not student:
        raise HTTPException(status_code=404, detail="That student is not in this school.")
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items() if v != ""}
    if patch:
        patch["updated_at"] = now_iso()
        db.table("src_students").update(patch).eq("id", student_id).execute()
    return {"student": {**student, **patch}}


# ---------------------------------------------------------------------------
# Teachers
# ---------------------------------------------------------------------------
@router.post("/schools/me/teachers/invite")
def invite_teacher(body: TeacherInvite, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    email = str(body.email).lower()
    existing = first_row(
        db.table("src_school_members").select("*").eq("school_id", ctx.school_id).eq("invited_email", email).limit(1)
    )
    if existing and existing.get("status") == "active":
        raise HTTPException(status_code=409, detail="That teacher is already part of this school.")
    code = (existing or {}).get("invite_code") or secrets.token_urlsafe(9)
    if existing:
        updated = _one(
            db.table("src_school_members")
            .update({"invited_email": email, "status": "invited", "invite_code": code})
            .eq("id", existing["id"])
            .execute()
            .data
        )
        return {"member": updated, "invite_code": code, "resent": True}
    created = _one(
        db.table("src_school_members")
        .insert(
            {
                "school_id": ctx.school_id,
                "role": "teacher",
                "status": "invited",
                "invited_email": email,
                "invited_by": ctx.user.id,
                "invite_code": code,
            }
        )
        .execute()
        .data
    )
    return {"member": created, "invite_code": code, "resent": False}


@router.post("/schools/me/teachers")
def create_teacher(body: TeacherCreate, ctx: SchoolContext = Depends(require_admin)):
    """One form: the teacher, the classes and subjects they handle, and form classes.

    Creates the invitation and every responsibility together, so the administrator
    never has to repeat the setup in a second screen. A teacher keeps one account and
    can hold as many responsibilities as the school gives them.
    """
    db = get_supabase()
    email = str(body.email).lower().strip()
    existing = first_row(
        db.table("src_school_members").select("*").eq("school_id", ctx.school_id).eq("invited_email", email).limit(1)
    )
    if existing and existing.get("status") == "active":
        raise HTTPException(status_code=409, detail="That teacher is already part of this school.")

    class_ids = [cid for cid in dict.fromkeys(body.class_ids) if cid]
    subject_ids = [sid for sid in dict.fromkeys(body.subject_ids) if sid]
    form_ids = [cid for cid in dict.fromkeys(body.form_class_ids) if cid]
    if class_ids:
        found = rows(db.table("src_classes").select("id").eq("school_id", ctx.school_id).in_("id", class_ids))
        if len(found) != len(class_ids):
            raise HTTPException(status_code=404, detail="One of those classes is not in this school.")
    if subject_ids:
        found = rows(db.table("src_subjects").select("id").eq("school_id", ctx.school_id).in_("id", subject_ids))
        if len(found) != len(subject_ids):
            raise HTTPException(status_code=404, detail="One of those subjects is not in this school.")

    code = (existing or {}).get("invite_code") or secrets.token_urlsafe(9)
    if existing:
        member = _one(
            db.table("src_school_members")
            .update({"invited_email": email, "status": "invited", "invite_code": code, "full_name": body.full_name.strip()})
            .eq("id", existing["id"])
            .execute()
            .data
        )
    else:
        member = _one(
            db.table("src_school_members")
            .insert(
                {
                    "school_id": ctx.school_id,
                    "role": "teacher",
                    "status": "invited",
                    "invited_email": email,
                    "full_name": body.full_name.strip(),
                    "invited_by": ctx.user.id,
                    "invite_code": code,
                }
            )
            .execute()
            .data
        )

    wanted = [
        {"class_id": class_id, "subject_id": subject_id, "kind": "subject"}
        for class_id in class_ids
        for subject_id in subject_ids
    ] + [{"class_id": class_id, "subject_id": None, "kind": "form"} for class_id in form_ids]

    have = rows(db.table("src_assignments").select("*").eq("school_id", ctx.school_id).eq("member_id", member["id"]))
    seen = {(a["class_id"], a.get("subject_id"), a["kind"]) for a in have}
    created = []
    for item in wanted:
        if (item["class_id"], item["subject_id"], item["kind"]) in seen:
            continue
        created.append(
            _one(
                db.table("src_assignments")
                .insert(
                    {
                        "school_id": ctx.school_id,
                        "session_id": body.session_id,
                        "member_id": member["id"],
                        "class_id": item["class_id"],
                        "subject_id": item["subject_id"],
                        "kind": item["kind"],
                    }
                )
                .execute()
                .data
            )
        )
    return {"member": member, "invite_code": code, "assignments": created, "responsibilities": len(created) + len(have)}


@router.get("/schools/me/teachers")
def list_teachers(ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    members = rows(
        db.table("src_school_members").select("*").eq("school_id", ctx.school_id).eq("role", "teacher").order("created_at")
    )
    assignments = rows(db.table("src_assignments").select("*").eq("school_id", ctx.school_id))
    classes = {c["id"]: c["name"] for c in rows(db.table("src_classes").select("*").eq("school_id", ctx.school_id))}
    subjects = {s["id"]: s["name"] for s in rows(db.table("src_subjects").select("*").eq("school_id", ctx.school_id))}
    for member in members:
        mine = [a for a in assignments if a["member_id"] == member["id"]]
        member["responsibilities"] = [
            {
                "id": a["id"],
                "kind": a["kind"],
                "class_id": a["class_id"],
                "class_name": classes.get(a["class_id"]),
                "subject_id": a.get("subject_id"),
                "subject_name": subjects.get(a.get("subject_id")) if a.get("subject_id") else None,
            }
            for a in mine
        ]
    return {"teachers": members}


@router.post("/schools/me/assignments")
def create_assignment(body: AssignmentCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    member = first_row(
        db.table("src_school_members").select("*").eq("id", body.member_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not member or member.get("role") != "teacher":
        raise HTTPException(status_code=404, detail="That teacher is not in this school.")
    if body.kind == "subject" and not body.subject_id:
        raise HTTPException(status_code=422, detail="Choose a subject for a subject-teaching assignment.")
    if body.kind == "form" and body.subject_id:
        raise HTTPException(status_code=422, detail="A form-teacher assignment does not take a subject.")

    created = _one(
        db.table("src_assignments")
        .insert(
            {
                "school_id": ctx.school_id,
                "session_id": body.session_id,
                "member_id": body.member_id,
                "class_id": body.class_id,
                "subject_id": body.subject_id if body.kind == "subject" else None,
                "kind": body.kind,
            }
        )
        .execute()
        .data
    )
    return {"assignment": created}


@router.delete("/schools/me/assignments/{assignment_id}")
def delete_assignment(assignment_id: str, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    assignment = first_row(
        db.table("src_assignments").select("*").eq("id", assignment_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="That assignment is not in this school.")
    db.table("src_assignments").delete().eq("id", assignment_id).execute()
    return {"removed": True}


# ---------------------------------------------------------------------------
# Assessment configuration
# ---------------------------------------------------------------------------
@router.post("/schools/me/assessment-config")
def create_config(body: ConfigCreate, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    total = body.ca1_max + body.ca2_max + body.ca3_max + body.exam_max
    if abs(total - body.total_max) > 0.001:
        raise HTTPException(
            status_code=422,
            detail=f"The CA parts and the exam add up to {total:g}, which does not match the total of {body.total_max:g}.",
        )
    latest = first_row(
        db.table("src_assessment_configs")
        .select("*")
        .eq("school_id", ctx.school_id)
        .eq("session_id", body.session_id)
        .order("version", desc=True)
        .limit(1)
    )
    version = int((latest or {}).get("version") or 0) + 1
    created = _one(
        db.table("src_assessment_configs")
        .insert(
            {
                "school_id": ctx.school_id,
                "session_id": body.session_id,
                "term_id": body.term_id,
                "version": version,
                "ca1_max": body.ca1_max,
                "ca2_max": body.ca2_max,
                "ca3_max": body.ca3_max,
                "exam_max": body.exam_max,
                "total_max": body.total_max,
                "pass_mark": body.pass_mark,
                "grading_scale": body.grading_scale or DEFAULT_SCALE,
                "rank_policy": body.rank_policy,
                "incomplete_policy": body.incomplete_policy,
                "created_by": ctx.user.id,
            }
        )
        .execute()
        .data
    )
    return {"config": created}


@router.get("/schools/me/assessment-config")
def list_configs(session_id: str | None = None, ctx: SchoolContext = Depends(get_school_context)):
    db = get_supabase()
    query = db.table("src_assessment_configs").select("*").eq("school_id", ctx.school_id)
    if session_id:
        query = query.eq("session_id", session_id)
    return {"configs": rows(query.order("version", desc=True))}


# ---------------------------------------------------------------------------
# Approvals: reopen a score sheet, approve, return, publish, reopen results
# ---------------------------------------------------------------------------
@router.post("/schools/me/sheets/{sheet_id}/reopen")
def reopen_sheet(sheet_id: str, body: ReasonBody, ctx: SchoolContext = Depends(require_admin)):
    """An authorised correction. Always recorded in the audit trail."""
    db = get_supabase()
    sheet = first_row(
        db.table("src_score_sheets").select("*").eq("id", sheet_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not sheet:
        raise HTTPException(status_code=404, detail="That score sheet is not in this school.")
    db.table("src_score_sheets").update(
        {"status": "returned", "return_reason": body.reason or "Reopened for correction", "updated_at": now_iso()}
    ).eq("id", sheet_id).execute()
    audit(db, ctx, "sheet_reopened", sheet_id=sheet_id, detail={"reason": body.reason})
    return {"sheet": {**sheet, "status": "returned"}}


def _compilation(db, ctx: SchoolContext, compilation_id: str) -> dict:
    compilation = first_row(
        db.table("src_compilations").select("*").eq("id", compilation_id).eq("school_id", ctx.school_id).limit(1)
    )
    if not compilation:
        raise HTTPException(status_code=404, detail="That compilation is not in this school.")
    return compilation


@router.post("/schools/me/compilations/{compilation_id}/approve")
def approve_compilation(compilation_id: str, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    compilation = _compilation(db, ctx, compilation_id)
    if str(compilation.get("status")) != "submitted":
        raise HTTPException(status_code=409, detail="Only results submitted by a form teacher can be approved.")
    patch = {"status": "approved", "approved_by": ctx.user.id, "approved_at": now_iso(), "updated_at": now_iso()}
    db.table("src_compilations").update(patch).eq("id", compilation_id).execute()
    audit(db, ctx, "results_approved", compilation_id=compilation_id)
    return {"compilation": {**compilation, **patch}}


@router.post("/schools/me/compilations/{compilation_id}/return")
def return_compilation(compilation_id: str, body: ReasonBody, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    compilation = _compilation(db, ctx, compilation_id)
    if str(compilation.get("status")) in ("draft", "published"):
        raise HTTPException(status_code=409, detail="That compilation cannot be returned from its current state.")
    patch = {"status": "returned", "return_reason": body.reason or "Returned for correction", "updated_at": now_iso()}
    db.table("src_compilations").update(patch).eq("id", compilation_id).execute()
    audit(db, ctx, "results_returned", compilation_id=compilation_id, detail={"reason": body.reason})
    return {"compilation": {**compilation, **patch}}


@router.post("/schools/me/compilations/{compilation_id}/publish")
def publish_compilation(compilation_id: str, ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    compilation = _compilation(db, ctx, compilation_id)
    if str(compilation.get("status")) != "approved":
        raise HTTPException(status_code=409, detail="Approve the results before publishing them.")
    patch = {"status": "published", "published_by": ctx.user.id, "published_at": now_iso(), "updated_at": now_iso()}
    db.table("src_compilations").update(patch).eq("id", compilation_id).execute()
    audit(db, ctx, "results_published", compilation_id=compilation_id)
    return {"compilation": {**compilation, **patch}}


@router.post("/schools/me/compilations/{compilation_id}/reopen")
def reopen_compilation(compilation_id: str, body: ReasonBody, ctx: SchoolContext = Depends(require_admin)):
    """Reopening a published result is the only way back in, and it is always audited."""
    db = get_supabase()
    compilation = _compilation(db, ctx, compilation_id)
    if str(compilation.get("status")) not in ("published", "approved"):
        raise HTTPException(status_code=409, detail="Only approved or published results can be reopened.")
    patch = {"status": "returned", "return_reason": body.reason or "Reopened for correction", "updated_at": now_iso()}
    db.table("src_compilations").update(patch).eq("id", compilation_id).execute()
    audit(db, ctx, "results_reopened", compilation_id=compilation_id, detail={"reason": body.reason})
    return {"compilation": {**compilation, **patch}}


@router.get("/schools/me/audit")
def audit_trail(ctx: SchoolContext = Depends(require_admin), limit: int = 100):
    db = get_supabase()
    return {
        "events": rows(
            db.table("src_result_events")
            .select("*")
            .eq("school_id", ctx.school_id)
            .order("created_at", desc=True)
            .limit(min(limit, 200))
        )
    }
