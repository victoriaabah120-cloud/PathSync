"""Tenancy and role checks for the School Result Compiler.

Every school-scoped endpoint resolves the caller's membership from the database, so a
school administrator, teacher or student can only ever reach their own school's data.
The frontend never decides a permission.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from .auth import get_current_user, get_supabase
from .config import settings

SCHOOL_ADMIN = "school_admin"
TEACHER = "teacher"
STUDENT = "student"
STAFF_ROLES = (SCHOOL_ADMIN, TEACHER)


@dataclass
class SchoolContext:
    user: object
    school: dict
    member: dict | None
    role: str
    subscription: dict | None

    @property
    def school_id(self) -> str:
        return self.school["id"]

    @property
    def member_id(self) -> str | None:
        return (self.member or {}).get("id")

    @property
    def is_admin(self) -> bool:
        return self.role == SCHOOL_ADMIN

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES


def first_row(query) -> dict | None:
    rows = query.execute().data or []
    return rows[0] if rows else None


def rows(query) -> list[dict]:
    return query.execute().data or []


def membership_for(db, user_id: str, school_id: str | None = None) -> dict | None:
    query = db.table("src_school_members").select("*").eq("user_id", user_id).eq("status", "active")
    if school_id:
        query = query.eq("school_id", school_id)
    return first_row(query.order("created_at").limit(1))


def subscription_for(db, school_id: str) -> dict | None:
    """The school's current subscription: the live one, or the newest one on record."""
    live = first_row(
        db.table("src_subscriptions")
        .select("*")
        .eq("school_id", school_id)
        .in_("status", ["active", "pending"])
        .order("created_at", desc=True)
        .limit(1)
    )
    if live:
        return live
    return first_row(
        db.table("src_subscriptions").select("*").eq("school_id", school_id).order("created_at", desc=True).limit(1)
    )


def subscriptions_enforced() -> bool:
    """Whether the subscription gates apply.

    False only when the server runs with SUBSCRIPTION_ENFORCEMENT=disabled. The
    frontend can read this value but never change it, so the testing bypass cannot
    be switched on from a browser.
    """
    return settings.subscriptions_enforced


def effective_subscription_state(subscription: dict | None) -> str:
    """The state the product acts on: live while testing mode bypasses billing."""
    if not subscriptions_enforced():
        return "active"
    return subscription_state(subscription)


def subscription_state(subscription: dict | None) -> str:
    """active, pending, expired, none. Expiry is decided from the period end, not a flag."""
    if not subscription:
        return "none"
    status = str(subscription.get("status") or "")
    if status == "active":
        end = subscription.get("current_period_end")
        if end:
            try:
                ends = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
                if ends < datetime.now(timezone.utc):
                    return "expired"
            except ValueError:
                pass
        return "active"
    if status == "pending":
        return "pending"
    return "expired"


def active_student_count(db, school_id: str) -> int:
    response = (
        db.table("src_students")
        .select("id", count="exact")
        .eq("school_id", school_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return int(getattr(response, "count", None) or len(response.data or []))


def get_school_context(user=Depends(get_current_user)) -> SchoolContext:
    db = get_supabase()
    member = membership_for(db, user.id)
    if not member:
        raise HTTPException(status_code=403, detail="You are not part of a school yet.")
    school = first_row(db.table("src_schools").select("*").eq("id", member["school_id"]).limit(1))
    if not school:
        raise HTTPException(status_code=403, detail="That school no longer exists.")
    if school.get("status") != "active":
        raise HTTPException(status_code=403, detail="This school's access is suspended.")
    return SchoolContext(
        user=user,
        school=school,
        member=member,
        role=str(member.get("role")),
        subscription=subscription_for(db, school["id"]),
    )


def require_staff(ctx: SchoolContext = Depends(get_school_context)) -> SchoolContext:
    if not ctx.is_staff:
        raise HTTPException(status_code=403, detail="Only school staff can do that.")
    return ctx


def require_admin(ctx: SchoolContext = Depends(get_school_context)) -> SchoolContext:
    if not ctx.is_admin:
        raise HTTPException(status_code=403, detail="Only a school administrator can do that.")
    return ctx


def require_teacher(ctx: SchoolContext = Depends(get_school_context)) -> SchoolContext:
    if ctx.role != TEACHER:
        raise HTTPException(status_code=403, detail="Only a teacher can do that.")
    return ctx


def require_student(ctx: SchoolContext = Depends(get_school_context)) -> SchoolContext:
    if ctx.role != STUDENT:
        raise HTTPException(status_code=403, detail="Only a student can do that.")
    return ctx


def ensure_active_subscription(ctx: SchoolContext) -> dict:
    """Premium operations need a live subscription. Reads never do.

    While SUBSCRIPTION_ENFORCEMENT=disabled every school passes this gate, so the
    module can be exercised without a plan or a payment.
    """
    if not subscriptions_enforced():
        return ctx.subscription or {}
    state = subscription_state(ctx.subscription)
    if state == "active":
        return ctx.subscription or {}
    if state == "pending":
        raise HTTPException(
            status_code=402,
            detail="This school's subscription is awaiting payment. Finish checkout to unlock results.",
        )
    if state == "expired":
        raise HTTPException(
            status_code=402,
            detail="This school's subscription has expired. Renew it to add students or publish results.",
        )
    raise HTTPException(status_code=402, detail="Choose a subscription plan to use the result compiler.")


def ensure_capacity(ctx: SchoolContext, adding: int = 1) -> dict:
    """Block registration beyond the plan's student capacity.

    While SUBSCRIPTION_ENFORCEMENT=disabled there is no plan and no ceiling; ordinary
    data validation still runs on every student record.
    """
    if not subscriptions_enforced():
        return ctx.subscription or {}
    subscription = ensure_active_subscription(ctx)
    capacity = int(subscription.get("student_capacity") or 0)
    used = active_student_count(get_supabase(), ctx.school_id)
    if used + adding > capacity:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    f"This plan covers {capacity} students and {used} are already registered. "
                    "Upgrade the subscription to add more."
                ),
                "used": used,
                "capacity": capacity,
                "needs_upgrade": True,
            },
        )
    return subscription
