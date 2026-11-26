"""End-to-end rules for the School Result Compiler, against an in-memory Supabase.

The real client is replaced with a fake so every branch can run: capacity limits,
subscription expiry, invitations, score locking, compilation, approval, publishing
and cross-school isolation. Run with pytest or: python3 tests/test_school_module.py
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import pathlib
import sys
import types

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# supabase-py is not needed to test the rules; the fake below stands in for it.
if "supabase" not in sys.modules:
    _stub = types.ModuleType("supabase")
    _stub.Client = object
    _stub.create_client = lambda *args, **kwargs: None
    sys.modules["supabase"] = _stub

from fastapi import HTTPException  # noqa: E402

from app import school_tenancy  # noqa: E402
from app.config import settings  # noqa: E402
from app.routers import school_admin, school_student, school_teaching, schools  # noqa: E402
from app.school_schemas import (  # noqa: E402
    AssignmentCreate,
    ClassCreate,
    ClassSubjectCreate,
    ConfigCreate,
    JoinSchool,
    ReasonBody,
    SchoolRegister,
    ScoresSave,
    ScoreRow,
    SessionCreate,
    StudentCreate,
    SubjectCreate,
    TeacherInvite,
    TermCreate,
)
from app.school_service import active_session, active_term, compile_and_store  # noqa: E402
from app.school_tenancy import SchoolContext, ensure_capacity, subscription_state  # noqa: E402


# ---------------------------------------------------------------------------
# A tiny in-memory Supabase
# ---------------------------------------------------------------------------
class FakeError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class Response:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class Query:
    def __init__(self, db, table):
        self.db = db
        self.name = table
        self.op = "select"
        self.filters = []
        self.payload = None
        self.order_spec = None
        self.limit_n = None
        self.want_count = False

    def select(self, cols="*", count=None):
        self.op = "select"
        self.want_count = count == "exact"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, patch):
        self.op = "update"
        self.payload = patch
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, values):
        self.filters.append(("in", col, list(values)))
        return self

    def is_(self, col, val):
        self.filters.append(("is", col, None if val == "null" else val))
        return self

    def order(self, col, desc=False):
        self.order_spec = (col, desc)
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def _match(self, row) -> bool:
        for op, col, val in self.filters:
            got = row.get(col)
            if op == "eq" and got != val:
                return False
            if op == "in" and got not in val:
                return False
            if op == "is" and got is not None:
                return False
        return True

    def execute(self):
        table = self.db.tables.setdefault(self.name, [])
        if self.op == "select":
            matched = [dict(r) for r in table if self._match(r)]
            if self.order_spec:
                col, desc = self.order_spec
                matched.sort(key=lambda r: (r.get(col) is None, str(r.get(col))), reverse=desc)
            total = len(matched)
            if self.limit_n:
                matched = matched[: self.limit_n]
            return Response(matched, count=total if self.want_count else None)
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            created = []
            for item in items:
                row = dict(item)
                row.setdefault("id", f"{self.name}-{len(table) + 1}")
                row.setdefault("created_at", f"2026-11-26T00:00:{len(table):02d}+00:00")
                if self.name == "src_webhook_events" and any(
                    r.get("provider") == row.get("provider") and r.get("event_id") == row.get("event_id") for r in table
                ):
                    raise FakeError("23505", "duplicate webhook event")
                table.append(row)
                created.append(dict(row))
            return Response(created)
        if self.op == "update":
            updated = []
            for row in table:
                if self._match(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return Response(updated)
        removed = [dict(r) for r in table if self._match(r)]
        self.db.tables[self.name] = [r for r in table if not self._match(r)]
        return Response(removed)


class FakeDB:
    def __init__(self):
        self.tables = {}

    def table(self, name):
        return Query(self, name)

    def add(self, name, row):
        self.tables.setdefault(name, []).append(dict(row))
        return self.tables[name][-1]


def user(uid, email):
    return types.SimpleNamespace(id=uid, email=email)


def ctx_for(db, uid, role=None) -> SchoolContext:
    member = next(
        (m for m in db.tables.get("src_school_members", []) if m["user_id"] == uid and m.get("status") == "active"),
        None,
    )
    school = next(s for s in db.tables["src_schools"] if s["id"] == member["school_id"])
    subscription = school_tenancy.subscription_for(db, school["id"])
    return SchoolContext(user=user(uid, member.get("invited_email") or f"{uid}@x.com"), school=school, member=member, role=member["role"], subscription=subscription)


# ---------------------------------------------------------------------------
# World fixture
# ---------------------------------------------------------------------------
def build_world():
    db = FakeDB()
    db.add(
        "src_plans",
        {
            "id": "plan-basic",
            "code": "basic",
            "name": "Basic",
            "min_students": 1,
            "max_students": 2,
            "monthly_price_kobo": 2500000,
            "annual_price_kobo": 25000000,
            "currency": "NGN",
            "is_active": True,
            "sort_order": 1,
        },
    )
    for module in (schools, school_admin, school_teaching, school_student):
        module.get_supabase = lambda: db
    school_tenancy.get_supabase = lambda: db
    settings.paystack_secret_key = "sk_test_fake"

    admin = user("admin-1", "admin@school.test")
    schools.register_school(
        SchoolRegister(
            name="Crown Heights Academy",
            school_type="secondary",
            email="hello@crown.test",
            phone="08000000000",
            address="1 School Road",
            city="Lagos",
            state="Lagos",
        ),
        user=admin,
    )
    admin_ctx = ctx_for(db, "admin-1")
    session = school_admin.create_session(SessionCreate(name="2025/2026", is_current=True), ctx=admin_ctx)["session"]
    term = school_admin.create_term(TermCreate(session_id=session["id"], name="First Term", is_current=True), ctx=admin_ctx)["term"]
    klass = school_admin.create_class(ClassCreate(name="JSS 1A"), ctx=admin_ctx)["class"]
    maths = school_admin.create_subject(SubjectCreate(name="Mathematics", code="MTH"), ctx=admin_ctx)["subject"]
    english = school_admin.create_subject(SubjectCreate(name="English", code="ENG"), ctx=admin_ctx)["subject"]
    for subject in (maths, english):
        school_admin.add_class_subject(
            ClassSubjectCreate(session_id=session["id"], class_id=klass["id"], subject_id=subject["id"]), ctx=admin_ctx
        )
    school_admin.create_config(
        ConfigCreate(session_id=session["id"], term_id=term["id"], ca1_max=10, ca2_max=10, ca3_max=10, exam_max=70),
        ctx=admin_ctx,
    )
    return {
        "db": db,
        "admin": admin,
        "admin_ctx": admin_ctx,
        "session": session,
        "term": term,
        "klass": klass,
        "maths": maths,
        "english": english,
    }


def activate_subscription(db, capacity=2):
    db.add(
        "src_subscriptions",
        {
            "id": "sub-1",
            "school_id": db.tables["src_schools"][0]["id"],
            "plan_id": "plan-basic",
            "billing_cycle": "monthly",
            "status": "active",
            "student_capacity": capacity,
            "amount_kobo": 2500000,
            "currency": "NGN",
            "current_period_start": "2026-11-01T00:00:00+00:00",
            "current_period_end": "2099-01-01T00:00:00+00:00",
        },
    )


def add_student(world, admission, first="Ada", last="Obi", enrol=True):
    return school_admin.create_student(
        StudentCreate(
            admission_no=admission,
            first_name=first,
            last_name=last,
            class_id=world["klass"]["id"] if enrol else None,
            session_id=world["session"]["id"],
        ),
        ctx=ctx_for(world["db"], "admin-1"),
    )["student"]


def invite_and_activate(world, email, uid):
    invite = school_admin.invite_teacher(TeacherInvite(email=email, full_name="Teacher"), ctx=ctx_for(world["db"], "admin-1"))
    joined = school_admin.join_school(JoinSchool(invite_code=invite["invite_code"]), user=user(uid, email))
    return invite, joined


def score_sheet(world, subject, teacher_ctx):
    sheet = school_teaching.get_or_create_sheet(
        world["db"], teacher_ctx, world["session"]["id"], world["term"]["id"], world["klass"]["id"], subject["id"]
    )
    return sheet


def rows_for(world, students, values):
    return ScoresSave(
        rows=[
            ScoreRow(student_id=s["id"], ca1=v[0], ca2=v[1], ca3=v[2], exam=v[3])
            for s, v in zip(students, values)
        ]
    )


# ---------------------------------------------------------------------------
# 1-2. Registration, plans, capacity
# ---------------------------------------------------------------------------
def test_a_school_can_register_and_binds_its_admin():
    world = build_world()
    schools_rows = world["db"].tables["src_schools"]
    members = world["db"].tables["src_school_members"]
    assert len(schools_rows) == 1 and schools_rows[0]["name"] == "Crown Heights Academy"
    assert len(members) == 1 and members[0]["role"] == "school_admin" and members[0]["status"] == "active"
    try:
        schools.register_school(
            SchoolRegister(name="Second School", email="b@c.test"), user=user("admin-1", "admin@school.test")
        )
        raise AssertionError("a second school was allowed for the same account")
    except HTTPException as exc:
        assert exc.status_code == 409


def test_plans_are_configurable_records():
    world = build_world()
    plans = schools.list_plans()["plans"]
    assert plans[0]["code"] == "basic" and plans[0]["max_students"] == 2
    assert plans[0]["monthly_price_kobo"] == 2500000


def test_capacity_blocks_registration_beyond_the_plan():
    world = build_world()
    activate_subscription(world["db"], capacity=2)
    add_student(world, "ADM001")
    add_student(world, "ADM002")
    try:
        add_student(world, "ADM003")
        raise AssertionError("a third student was allowed on a two-student plan")
    except HTTPException as exc:
        assert exc.status_code == 409
        assert exc.detail["needs_upgrade"] is True


def test_no_subscription_means_no_premium_operations():
    world = build_world()
    try:
        add_student(world, "ADM001")
        raise AssertionError("a student was added without a subscription")
    except HTTPException as exc:
        assert exc.status_code == 402


# ---------------------------------------------------------------------------
# 3. Payment verification activates the subscription
# ---------------------------------------------------------------------------
def test_payment_verification_activates_and_expiry_is_derived():
    world = build_world()
    db = world["db"]
    db.add(
        "src_subscriptions",
        {
            "id": "sub-1",
            "school_id": db.tables["src_schools"][0]["id"],
            "plan_id": "plan-basic",
            "billing_cycle": "monthly",
            "status": "pending",
            "student_capacity": 2,
            "amount_kobo": 2500000,
            "currency": "NGN",
            "paystack_reference": "ref-1",
        },
    )
    db.add(
        "src_payments",
        {
            "id": "pay-1",
            "school_id": db.tables["src_schools"][0]["id"],
            "subscription_id": "sub-1",
            "provider": "paystack",
            "reference": "ref-1",
            "amount_kobo": 2500000,
            "currency": "NGN",
            "status": "pending",
        },
    )

    schools._verify_with_paystack = lambda ref: {"status": False, "data": {"status": "failed"}}
    try:
        schools.activate_subscription(db, "ref-1")
        raise AssertionError("an unverified payment activated a subscription")
    except HTTPException as exc:
        assert exc.status_code == 402

    schools._verify_with_paystack = lambda ref: {
        "status": True,
        "data": {"status": "success", "amount": 2500000, "reference": ref, "paid_at": "2026-11-26T00:00:00Z"},
    }
    result = schools.activate_subscription(db, "ref-1")
    assert result["subscription"]["status"] == "active"
    assert result["already"] is False
    assert db.tables["src_invoices"][0]["status"] == "paid"
    assert subscription_state(result["subscription"]) == "active"
    # idempotent: a second call does not re-charge or duplicate the invoice
    again = schools.activate_subscription(db, "ref-1")
    assert again["already"] is True and len(db.tables["src_invoices"]) == 1


def test_amount_mismatch_is_refused():
    world = build_world()
    db = world["db"]
    db.add("src_subscriptions", {"id": "sub-1", "school_id": db.tables["src_schools"][0]["id"], "plan_id": "plan-basic", "billing_cycle": "monthly", "status": "pending", "student_capacity": 2, "amount_kobo": 2500000})
    db.add("src_payments", {"id": "pay-1", "school_id": db.tables["src_schools"][0]["id"], "subscription_id": "sub-1", "reference": "ref-2", "amount_kobo": 2500000, "status": "pending"})
    schools._verify_with_paystack = lambda ref: {"status": True, "data": {"status": "success", "amount": 100}}
    try:
        schools.activate_subscription(db, "ref-2")
        raise AssertionError("an underpayment activated the subscription")
    except HTTPException as exc:
        assert exc.status_code == 402


def test_webhook_rejects_bad_signature_and_processes_once():
    world = build_world()
    db = world["db"]
    school_id = db.tables["src_schools"][0]["id"]
    db.add("src_subscriptions", {"id": "sub-w", "school_id": school_id, "plan_id": "plan-basic", "billing_cycle": "monthly", "status": "pending", "student_capacity": 2, "amount_kobo": 2500000})
    db.add("src_payments", {"id": "pay-w", "school_id": school_id, "subscription_id": "sub-w", "reference": "ref-3", "amount_kobo": 2500000, "status": "pending"})
    schools._verify_with_paystack = lambda ref: {"status": True, "data": {"status": "success", "amount": 2500000, "reference": ref}}

    class Request:
        def __init__(self, payload):
            self.payload = payload

        async def body(self):
            return self.payload

    event = {"event": "charge.success", "data": {"id": 991, "reference": "ref-3", "status": "success"}}
    raw = json.dumps(event).encode()
    try:
        asyncio.run(schools.paystack_webhook(Request(raw), x_paystack_signature="nonsense"))
        raise AssertionError("an unsigned webhook was accepted")
    except HTTPException as exc:
        assert exc.status_code == 401

    good = hmac.new(settings.paystack_secret_key.encode(), raw, hashlib.sha512).hexdigest()
    first = asyncio.run(schools.paystack_webhook(Request(raw), x_paystack_signature=good))
    second = asyncio.run(schools.paystack_webhook(Request(raw), x_paystack_signature=good))
    assert first["activated"] is True
    assert second.get("duplicate") is True
    assert len(db.tables["src_webhook_events"]) == 1
    # the subscription is live and only one invoice exists after the replay
    assert next(s for s in db.tables["src_subscriptions"] if s["id"] == "sub-w")["status"] == "active"
    assert len(db.tables["src_invoices"]) == 1


def test_expired_subscription_restricts_but_keeps_data():
    world = build_world()
    db = world["db"]
    activate_subscription(db, capacity=2)
    sub = db.tables["src_subscriptions"][0]
    sub["current_period_end"] = "2020-01-01T00:00:00+00:00"
    assert subscription_state(sub) == "expired"
    admin_ctx = ctx_for(db, "admin-1")
    try:
        ensure_capacity(admin_ctx)
        raise AssertionError("an expired subscription allowed a premium operation")
    except HTTPException as exc:
        assert exc.status_code == 402
    # history is still readable
    detail = schools.my_school(admin_ctx)
    assert detail["school"]["name"] == "Crown Heights Academy"
    assert detail["subscription_state"] == "expired"


# ---------------------------------------------------------------------------
# 4-5. Classes, students, teachers, responsibilities
# ---------------------------------------------------------------------------
def test_admin_creates_classes_students_and_enrolments():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    student = add_student(world, "ADM010", "Chidi", "Eze")
    enrolments = world["db"].tables["src_enrolments"]
    assert student["admission_no"] == "ADM010"
    assert len(enrolments) == 1 and enrolments[0]["student_id"] == student["id"]
    listed = school_admin.list_students(ctx=ctx_for(world["db"], "admin-1"))["students"]
    assert listed[0]["class_name"] == "JSS 1A"


def test_teacher_invite_activation_and_email_check():
    world = build_world()
    invite, joined = invite_and_activate(world, "teacher@school.test", "teacher-1")
    assert invite["invite_code"]
    assert joined["role"] == "teacher"
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    assert member["status"] == "active"
    # a different email cannot use the same code
    invite2 = school_admin.invite_teacher(TeacherInvite(email="other@school.test"), ctx=ctx_for(world["db"], "admin-1"))
    try:
        school_admin.join_school(JoinSchool(invite_code=invite2["invite_code"]), user=user("stranger", "stranger@x.com"))
        raise AssertionError("an invitation was used by the wrong email")
    except HTTPException as exc:
        assert exc.status_code == 403


def test_one_teacher_can_hold_several_responsibilities():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    admin_ctx = ctx_for(world["db"], "admin-1")
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="subject", subject_id=world["maths"]["id"]),
        ctx=admin_ctx,
    )
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="subject", subject_id=world["english"]["id"]),
        ctx=admin_ctx,
    )
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="form"),
        ctx=admin_ctx,
    )
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    result = school_teaching.responsibilities(ctx=teacher_ctx)
    assert len(result["subject_roles"]) == 2
    assert len(result["form_roles"]) == 1
    # one account, one member row
    assert len([m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1"]) == 1


# ---------------------------------------------------------------------------
# 6-7. Score entry, validation, locking
# ---------------------------------------------------------------------------
def test_scores_are_validated_against_the_configured_maxima():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="subject", subject_id=world["maths"]["id"]),
        ctx=ctx_for(world["db"], "admin-1"),
    )
    student = add_student(world, "ADM020")
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    sheet = score_sheet(world, world["maths"], teacher_ctx)

    try:
        school_teaching.save_scores(sheet["id"], rows_for(world, [student], [(11, 10, 10, 70)]), ctx=teacher_ctx)
        raise AssertionError("a score above the maximum was accepted")
    except HTTPException as exc:
        assert exc.status_code == 422

    saved = school_teaching.save_scores(sheet["id"], rows_for(world, [student], [(10, 9, 8, 60)]), ctx=teacher_ctx)
    assert saved["saved"] == 1
    row = world["db"].tables["src_scores"][0]
    assert row["total"] == 87 and row["grade"] == "A1"


def test_submitted_scores_are_locked_until_reopened():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="subject", subject_id=world["maths"]["id"]),
        ctx=ctx_for(world["db"], "admin-1"),
    )
    student = add_student(world, "ADM030")
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    sheet = score_sheet(world, world["maths"], teacher_ctx)

    # incomplete sheet cannot be submitted
    school_teaching.save_scores(sheet["id"], ScoresSave(rows=[ScoreRow(student_id=student["id"], ca1=10)]), ctx=teacher_ctx)
    try:
        school_teaching.submit_sheet(sheet["id"], ctx=teacher_ctx)
        raise AssertionError("an incomplete sheet was submitted")
    except HTTPException as exc:
        assert exc.status_code == 409

    school_teaching.save_scores(sheet["id"], rows_for(world, [student], [(10, 10, 10, 60)]), ctx=teacher_ctx)
    submitted = school_teaching.submit_sheet(sheet["id"], ctx=teacher_ctx)
    assert submitted["sheet"]["status"] == "submitted"

    try:
        school_teaching.save_scores(sheet["id"], rows_for(world, [student], [(1, 1, 1, 1)]), ctx=teacher_ctx)
        raise AssertionError("a submitted sheet was edited")
    except HTTPException as exc:
        assert exc.status_code == 409

    # the administrator can reopen it, and that is audited
    school_admin.reopen_sheet(sheet["id"], ReasonBody(reason="wrong exam mark"), ctx=ctx_for(world["db"], "admin-1"))
    reopened = next(s for s in world["db"].tables["src_score_sheets"] if s["id"] == sheet["id"])
    assert reopened["status"] == "returned"
    actions = [e["action"] for e in world["db"].tables["src_result_events"]]
    assert "sheet_reopened" in actions
    school_teaching.save_scores(sheet["id"], rows_for(world, [student], [(10, 10, 10, 65)]), ctx=teacher_ctx)


# ---------------------------------------------------------------------------
# 8-11. Compilation, approval, publishing, locking
# ---------------------------------------------------------------------------
def _compiled_world():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    admin_ctx = ctx_for(world["db"], "admin-1")
    for subject in (world["maths"], world["english"]):
        school_admin.create_assignment(
            AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="subject", subject_id=subject["id"]),
            ctx=admin_ctx,
        )
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="form"),
        ctx=admin_ctx,
    )
    world["students"] = [add_student(world, "ADM100", "Ada", "Obi"), add_student(world, "ADM101", "Bola", "Ade")]
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    for subject, values in ((world["maths"], [(10, 10, 10, 60), (5, 5, 5, 40)]), (world["english"], [(8, 8, 8, 50), (9, 9, 9, 60)])):
        sheet = score_sheet(world, subject, teacher_ctx)
        school_teaching.save_scores(sheet["id"], rows_for(world, world["students"], values), ctx=teacher_ctx)
        school_teaching.submit_sheet(sheet["id"], ctx=teacher_ctx)
    world["teacher_ctx"] = teacher_ctx
    return world


def test_compilation_produces_correct_results():
    world = _compiled_world()
    compiled = school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=world["teacher_ctx"])
    rows = {r["student_id"]: r for r in compiled["students"]}
    first, second = world["students"]
    assert rows[first["id"]]["total_score"] == 164 and rows[first["id"]]["position"] == 1
    assert rows[second["id"]]["total_score"] == 142 and rows[second["id"]]["position"] == 2
    assert compiled["class_average"] == 76.5
    stored = world["db"].tables["src_compiled_results"]
    assert len(stored) == 2
    compilation = world["db"].tables["src_compilations"][0]
    assert compilation["config_snapshot"]["pass_mark"] == 40


def test_compile_is_blocked_while_a_subject_is_pending():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    member = next(m for m in world["db"].tables["src_school_members"] if m["user_id"] == "teacher-1")
    admin_ctx = ctx_for(world["db"], "admin-1")
    school_admin.create_assignment(
        AssignmentCreate(session_id=world["session"]["id"], member_id=member["id"], class_id=world["klass"]["id"], kind="form"),
        ctx=admin_ctx,
    )
    add_student(world, "ADM200")
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    try:
        school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
        raise AssertionError("results compiled with no submitted scores")
    except HTTPException as exc:
        assert exc.status_code == 409
        assert exc.detail["missing"]


def test_approval_publish_and_locking():
    world = _compiled_world()
    teacher_ctx = world["teacher_ctx"]
    admin_ctx = ctx_for(world["db"], "admin-1")
    school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
    submitted = school_teaching.submit_results(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
    compilation_id = submitted["compilation"]["id"]

    try:
        school_admin.publish_compilation(compilation_id, ctx=admin_ctx)
        raise AssertionError("unapproved results were published")
    except HTTPException as exc:
        assert exc.status_code == 409

    school_admin.approve_compilation(compilation_id, ctx=admin_ctx)
    published = school_admin.publish_compilation(compilation_id, ctx=admin_ctx)
    assert published["compilation"]["status"] == "published"

    try:
        school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
        raise AssertionError("published results were recompiled")
    except HTTPException as exc:
        assert exc.status_code == 409

    school_admin.reopen_compilation(compilation_id, ReasonBody(reason="principal asked for a remark change"), ctx=admin_ctx)
    reopened = next(c for c in world["db"].tables["src_compilations"] if c["id"] == compilation_id)
    assert reopened["status"] == "returned"
    actions = [e["action"] for e in world["db"].tables["src_result_events"]]
    assert {"results_approved", "results_published", "results_reopened"} <= set(actions)


# ---------------------------------------------------------------------------
# 12-13. Student access and school isolation
# ---------------------------------------------------------------------------
def _published_world():
    world = _compiled_world()
    teacher_ctx = world["teacher_ctx"]
    admin_ctx = ctx_for(world["db"], "admin-1")
    school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
    submitted = school_teaching.submit_results(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
    school_admin.approve_compilation(submitted["compilation"]["id"], ctx=admin_ctx)
    school_admin.publish_compilation(submitted["compilation"]["id"], ctx=admin_ctx)
    world["compilation_id"] = submitted["compilation"]["id"]
    return world


def test_students_read_only_their_own_published_results():
    world = _published_world()
    db = world["db"]
    first, second = world["students"]
    # link accounts
    first_row = next(s for s in db.tables["src_students"] if s["id"] == first["id"])
    first_row["user_id"] = "student-1"
    db.add("src_school_members", {"id": "mem-s1", "school_id": first_row["school_id"], "user_id": "student-1", "role": "student", "status": "active"})
    second_row = next(s for s in db.tables["src_students"] if s["id"] == second["id"])
    second_row["user_id"] = "student-2"
    db.add("src_school_members", {"id": "mem-s2", "school_id": second_row["school_id"], "user_id": "student-2", "role": "student", "status": "active"})

    student_ctx = ctx_for(db, "student-1")
    report = school_student.my_report(world["compilation_id"], ctx=student_ctx)
    assert report["student"]["admission_no"] == "ADM100"
    assert len(report["subjects"]) == 2 and report["position"] == 1

    other = ctx_for(db, "student-2")
    other_report = school_student.my_report(world["compilation_id"], ctx=other)
    assert other_report["student"]["admission_no"] == "ADM101"
    assert other_report["position"] == 2


def test_unpublished_results_are_hidden_from_students():
    world = _compiled_world()
    db = world["db"]
    teacher_ctx = world["teacher_ctx"]
    school_teaching.compile_class_view(world["klass"]["id"], session_id=world["session"]["id"], term_id=world["term"]["id"], ctx=teacher_ctx)
    compilation = db.tables["src_compilations"][0]
    first = world["students"][0]
    next(s for s in db.tables["src_students"] if s["id"] == first["id"])["user_id"] = "student-1"
    db.add("src_school_members", {"id": "mem-s1", "school_id": first["school_id"], "user_id": "student-1", "role": "student", "status": "active"})
    try:
        school_student.my_report(compilation["id"], ctx=ctx_for(db, "student-1"))
        raise AssertionError("an unpublished report was readable")
    except HTTPException as exc:
        assert exc.status_code == 403


def test_one_school_cannot_reach_another_school():
    world = build_world()
    db = world["db"]
    # a second school with its own compilation
    db.add("src_schools", {"id": "school-b", "name": "Other School", "slug": "other", "email": "o@o.test", "status": "active", "created_by": "admin-b"})
    db.add("src_compilations", {"id": "comp-b", "school_id": "school-b", "session_id": "s-b", "term_id": "t-b", "class_id": "c-b", "status": "approved"})
    admin_ctx = ctx_for(db, "admin-1")
    try:
        school_admin.approve_compilation("comp-b", ctx=admin_ctx)
        raise AssertionError("another school's compilation was reachable")
    except HTTPException as exc:
        assert exc.status_code == 404


def test_teacher_cannot_open_an_unassigned_sheet():
    world = build_world()
    activate_subscription(world["db"], capacity=5)
    invite_and_activate(world, "teacher@school.test", "teacher-1")
    teacher_ctx = ctx_for(world["db"], "teacher-1")
    sheet = school_teaching.get_or_create_sheet(
        world["db"], ctx_for(world["db"], "admin-1"), world["session"]["id"], world["term"]["id"], world["klass"]["id"], world["maths"]["id"]
    )
    try:
        school_teaching.get_sheet(sheet["id"], ctx=teacher_ctx)
        raise AssertionError("a teacher opened a subject that is not theirs")
    except HTTPException as exc:
        assert exc.status_code == 403


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {test.__name__} — {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
