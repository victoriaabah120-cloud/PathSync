"""Request shapes for the School Result Compiler endpoints."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class SchoolRegister(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    school_type: str = Field(default="secondary", pattern="^(primary|secondary|combined|other)$")
    email: str = Field(min_length=3, max_length=160, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=300)
    city: str = Field(default="", max_length=80)
    state: str = Field(default="", max_length=80)
    country: str = Field(default="Nigeria", max_length=80)


class SessionCreate(BaseModel):
    name: str = Field(min_length=4, max_length=40)
    starts_on: date | None = None
    ends_on: date | None = None
    is_current: bool = False


class TermCreate(BaseModel):
    session_id: str
    name: str = Field(min_length=2, max_length=40)
    position: int = Field(default=1, ge=1, le=3)
    starts_on: date | None = None
    ends_on: date | None = None
    is_current: bool = False


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    level: str = Field(default="", max_length=40)


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    code: str = Field(default="", max_length=20)


class ClassSubjectCreate(BaseModel):
    session_id: str
    class_id: str
    subject_id: str


class StudentCreate(BaseModel):
    admission_no: str = Field(min_length=1, max_length=40)
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    middle_name: str = Field(default="", max_length=60)
    gender: str = Field(default="", pattern="^(|male|female|other)$")
    date_of_birth: date | None = None
    guardian_name: str = Field(default="", max_length=120)
    guardian_phone: str = Field(default="", max_length=40)
    guardian_email: str = Field(default="", max_length=160)
    class_id: str | None = None
    session_id: str | None = None


class StudentUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=60)
    last_name: str | None = Field(default=None, max_length=60)
    middle_name: str | None = Field(default=None, max_length=60)
    gender: str | None = Field(default=None, pattern="^(|male|female|other)$")
    guardian_name: str | None = Field(default=None, max_length=120)
    guardian_phone: str | None = Field(default=None, max_length=40)
    guardian_email: str | None = Field(default=None, max_length=160)
    status: str | None = Field(default=None, pattern="^(active|graduated|withdrawn)$")


class TeacherInvite(BaseModel):
    email: str = Field(min_length=3, max_length=160, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(default="", max_length=120)


class JoinSchool(BaseModel):
    invite_code: str = Field(min_length=6, max_length=40)


class AssignmentCreate(BaseModel):
    session_id: str
    member_id: str
    class_id: str
    kind: str = Field(pattern="^(subject|form)$")
    subject_id: str | None = None


class ConfigCreate(BaseModel):
    session_id: str
    term_id: str | None = None
    ca1_max: float = Field(default=10, ge=0, le=100)
    ca2_max: float = Field(default=10, ge=0, le=100)
    ca3_max: float = Field(default=10, ge=0, le=100)
    exam_max: float = Field(default=70, ge=0, le=200)
    total_max: float = Field(default=100, gt=0, le=300)
    pass_mark: float = Field(default=40, ge=0, le=300)
    grading_scale: list[dict] | None = None
    rank_policy: str = Field(default="competition", pattern="^(competition|dense|ordinal)$")
    incomplete_policy: str = Field(default="block", pattern="^(block|exclude)$")


class ScoreRow(BaseModel):
    student_id: str
    ca1: float | None = None
    ca2: float | None = None
    ca3: float | None = None
    exam: float | None = None


class ScoresSave(BaseModel):
    rows: list[ScoreRow] = Field(min_length=1, max_length=500)


class ReasonBody(BaseModel):
    reason: str = Field(default="", max_length=400)


class CompileRequest(BaseModel):
    session_id: str
    term_id: str
    class_id: str
    form_teacher_remark: str = Field(default="", max_length=1000)


class CheckoutRequest(BaseModel):
    plan_code: str = Field(min_length=2, max_length=40)
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|annual)$")
