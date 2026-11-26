"""School registration, subscription plans, checkout and the Paystack webhook."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ..auth import get_current_user, get_supabase
from ..config import settings
from ..school_schemas import CheckoutRequest, SchoolRegister
from ..school_service import now_iso
from ..school_tenancy import (
    SCHOOL_ADMIN,
    SchoolContext,
    active_student_count,
    first_row,
    get_school_context,
    require_admin,
    rows,
    subscription_for,
    subscription_state,
)

router = APIRouter(tags=["schools"])
logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"
CYCLE_DAYS = {"monthly": 30, "annual": 365}


def _slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "school"
    return f"{base}-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}"


def _plan_public(plan: dict) -> dict:
    return {
        "id": plan["id"],
        "code": plan["code"],
        "name": plan["name"],
        "min_students": plan["min_students"],
        "max_students": plan["max_students"],
        "monthly_price_kobo": plan["monthly_price_kobo"],
        "annual_price_kobo": plan["annual_price_kobo"],
        "currency": plan.get("currency") or "NGN",
    }


def _capacity_for(plan: dict) -> int:
    """Student capacity for a plan. Enterprise has no ceiling, so it gets a large bound."""
    if plan.get("max_students"):
        return int(plan["max_students"])
    return 10_000_000


def _period_end(start: datetime, cycle: str) -> datetime:
    return start + timedelta(days=CYCLE_DAYS.get(cycle, 30))


@router.get("/schools/plans")
def list_plans():
    """Public pricing: the tiers and their configurable prices."""
    db = get_supabase()
    plans = rows(
        db.table("src_plans").select("*").eq("is_active", True).order("sort_order")
    )
    return {"plans": [_plan_public(p) for p in plans]}


@router.post("/schools/register")
def register_school(body: SchoolRegister, user=Depends(get_current_user)):
    """Create the school and bind the caller as its administrator."""
    db = get_supabase()
    existing = first_row(db.table("src_school_members").select("*").eq("user_id", user.id).eq("status", "active").limit(1))
    if existing:
        raise HTTPException(status_code=409, detail="This account already belongs to a school.")

    school = {
        "name": body.name.strip(),
        "slug": _slug(body.name),
        "school_type": body.school_type,
        "email": str(body.email),
        "phone": body.phone,
        "address": body.address,
        "city": body.city,
        "state": body.state,
        "country": body.country,
        "status": "active",
        "created_by": user.id,
    }
    created = db.table("src_schools").insert(school).execute().data or []
    if not created:
        raise HTTPException(status_code=502, detail="The school could not be created. Please try again.")
    school_row = created[0]

    member = {
        "school_id": school_row["id"],
        "user_id": user.id,
        "role": SCHOOL_ADMIN,
        "status": "active",
        "activated_at": now_iso(),
        "invited_email": getattr(user, "email", None),
    }
    created_member = db.table("src_school_members").insert(member).execute().data or []
    if not created_member:
        db.table("src_schools").delete().eq("id", school_row["id"]).execute()
        raise HTTPException(status_code=502, detail="The administrator account could not be linked to the school.")

    return {
        "school": school_row,
        "member": created_member[0],
        "subscription": None,
        "subscription_state": "none",
    }


@router.get("/schools/me")
def my_school(ctx: SchoolContext = Depends(get_school_context)):
    """The caller's school, role, subscription and capacity usage."""
    db = get_supabase()
    state = subscription_state(ctx.subscription)
    capacity = int((ctx.subscription or {}).get("student_capacity") or 0)
    plan = None
    if ctx.subscription:
        plan = first_row(db.table("src_plans").select("*").eq("id", ctx.subscription["plan_id"]).limit(1))
    return {
        "school": ctx.school,
        "role": ctx.role,
        "member": ctx.member,
        "subscription": ctx.subscription,
        "subscription_state": state,
        "plan": _plan_public(plan) if plan else None,
        "students": {
            "used": active_student_count(db, ctx.school_id),
            "capacity": capacity,
            "remaining": max(capacity - active_student_count(db, ctx.school_id), 0) if capacity else 0,
        },
    }


@router.post("/schools/me/subscription/checkout")
def start_checkout(body: CheckoutRequest, ctx: SchoolContext = Depends(require_admin)):
    """Create the pending subscription and a Paystack payment for it."""
    db = get_supabase()
    plan = first_row(db.table("src_plans").select("*").eq("code", body.plan_code).eq("is_active", True).limit(1))
    if not plan:
        raise HTTPException(status_code=404, detail="That plan does not exist.")

    capacity = _capacity_for(plan)
    used = active_student_count(db, ctx.school_id)
    if used > capacity:
        raise HTTPException(
            status_code=409,
            detail=f"This plan covers {capacity} students but {used} are already registered. Choose a larger plan.",
        )

    amount = int(plan["annual_price_kobo"] if body.billing_cycle == "annual" else plan["monthly_price_kobo"])
    reference = f"src_{ctx.school_id[:8]}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

    existing = first_row(
        db.table("src_subscriptions")
        .select("*")
        .eq("school_id", ctx.school_id)
        .in_("status", ["pending", "active"])
        .limit(1)
    )
    payload = {
        "school_id": ctx.school_id,
        "plan_id": plan["id"],
        "billing_cycle": body.billing_cycle,
        "status": "pending",
        "student_capacity": capacity,
        "amount_kobo": amount,
        "currency": plan.get("currency") or "NGN",
        "paystack_reference": reference,
        "created_by": ctx.user.id,
    }
    if existing:
        db.table("src_subscriptions").update(payload).eq("id", existing["id"]).execute()
        subscription = {**existing, **payload}
    else:
        created = db.table("src_subscriptions").insert(payload).execute().data or []
        if not created:
            raise HTTPException(status_code=502, detail="The subscription could not be created.")
        subscription = created[0]

    payment = {
        "school_id": ctx.school_id,
        "subscription_id": subscription["id"],
        "provider": "paystack",
        "reference": reference,
        "amount_kobo": amount,
        "currency": payload["currency"],
        "status": "pending",
    }
    db.table("src_payments").insert(payment).execute()

    if not settings.paystack_secret_key:
        # No fake success: the subscription stays pending until a real payment is verified.
        raise HTTPException(
            status_code=503,
            detail=(
                "Payments are not configured yet. Add PAYSTACK_SECRET_KEY to the backend environment, "
                "then start the checkout again."
            ),
        )

    callback = f"{settings.frontend_url}/schools/subscription?reference={reference}"
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                headers={"Authorization": f"Bearer {settings.paystack_secret_key}"},
                json={
                    "email": getattr(ctx.user, "email", None) or ctx.school.get("email"),
                    "amount": amount,
                    "reference": reference,
                    "currency": payload["currency"],
                    "callback_url": callback,
                    "metadata": {
                        "school_id": ctx.school_id,
                        "plan_code": plan["code"],
                        "billing_cycle": body.billing_cycle,
                    },
                },
            )
        data = response.json()
    except Exception as exc:  # network or provider error
        logger.exception("paystack initialize failed")
        raise HTTPException(status_code=502, detail="The payment provider could not be reached. Please try again.") from exc

    if not data.get("status"):
        raise HTTPException(status_code=502, detail=data.get("message") or "The payment could not be started.")

    return {
        "reference": reference,
        "authorization_url": data["data"]["authorization_url"],
        "access_code": data["data"].get("access_code"),
        "subscription": subscription,
    }


@router.get("/schools/me/subscription")
def subscription_detail(ctx: SchoolContext = Depends(require_admin)):
    """Status, plan, invoices and payment history for the school administrator."""
    db = get_supabase()
    subscription = subscription_for(db, ctx.school_id)
    plan = first_row(db.table("src_plans").select("*").eq("id", subscription["plan_id"]).limit(1)) if subscription else None
    invoices = rows(
        db.table("src_invoices").select("*").eq("school_id", ctx.school_id).order("created_at", desc=True).limit(50)
    )
    payments = rows(
        db.table("src_payments").select("*").eq("school_id", ctx.school_id).order("created_at", desc=True).limit(50)
    )
    return {
        "subscription": subscription,
        "state": subscription_state(subscription),
        "plan": _plan_public(plan) if plan else None,
        "students": {"used": active_student_count(db, ctx.school_id), "capacity": int((subscription or {}).get("student_capacity") or 0)},
        "invoices": invoices,
        "payments": payments,
    }


def _verify_with_paystack(reference: str) -> dict:
    if not settings.paystack_secret_key:
        raise HTTPException(status_code=503, detail="Payments are not configured.")
    with httpx.Client(timeout=30) as client:
        response = client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {settings.paystack_secret_key}"},
        )
    return response.json()


def activate_subscription(db, reference: str) -> dict:
    """Turn a verified payment into an active subscription. Idempotent by reference."""
    payment = first_row(db.table("src_payments").select("*").eq("reference", reference).limit(1))
    if not payment:
        raise HTTPException(status_code=404, detail="Unknown payment reference.")
    if payment.get("status") == "success":
        subscription = first_row(db.table("src_subscriptions").select("*").eq("id", payment["subscription_id"]).limit(1))
        return {"payment": payment, "subscription": subscription, "already": True}

    verified = _verify_with_paystack(reference)
    data = (verified or {}).get("data") or {}
    if not verified.get("status") or data.get("status") != "success":
        raise HTTPException(status_code=402, detail="That payment has not been confirmed by Paystack.")
    if int(data.get("amount") or 0) < int(payment.get("amount_kobo") or 0):
        raise HTTPException(status_code=402, detail="The amount paid does not match this subscription.")

    paid_at = data.get("paid_at") or now_iso()
    db.table("src_payments").update(
        {
            "status": "success",
            "channel": data.get("channel"),
            "paid_at": paid_at,
            "verified_at": now_iso(),
            "raw": data,
        }
    ).eq("id", payment["id"]).execute()

    subscription = first_row(db.table("src_subscriptions").select("*").eq("id", payment["subscription_id"]).limit(1))
    if not subscription:
        raise HTTPException(status_code=409, detail="This payment is not linked to a subscription.")

    start = datetime.now(timezone.utc)
    end = _period_end(start, subscription.get("billing_cycle") or "monthly")
    # Supersede any other live subscription for this school.
    for other in rows(
        db.table("src_subscriptions")
        .select("*")
        .eq("school_id", subscription["school_id"])
        .eq("status", "active")
    ):
        if other["id"] != subscription["id"]:
            db.table("src_subscriptions").update({"status": "cancelled", "cancelled_at": now_iso()}).eq("id", other["id"]).execute()

    updated = {
        "status": "active",
        "started_at": start.isoformat(),
        "current_period_start": start.isoformat(),
        "current_period_end": end.isoformat(),
        "paystack_reference": reference,
    }
    db.table("src_subscriptions").update(updated).eq("id", subscription["id"]).execute()
    subscription = {**subscription, **updated}

    plan = first_row(db.table("src_plans").select("*").eq("id", subscription["plan_id"]).limit(1))
    db.table("src_invoices").insert(
        {
            "school_id": subscription["school_id"],
            "subscription_id": subscription["id"],
            "payment_id": payment["id"],
            "number": f"PS-{reference}",
            "amount_kobo": payment["amount_kobo"],
            "currency": payment.get("currency") or "NGN",
            "status": "paid",
            "paid_on": start.date().isoformat(),
            "line_items": [
                {
                    "description": f"{(plan or {}).get('name', 'Result Compiler')} plan, {subscription.get('billing_cycle')}",
                    "amount_kobo": payment["amount_kobo"],
                }
            ],
        }
    ).execute()

    return {"payment": {**payment, "status": "success"}, "subscription": subscription, "already": False}


@router.post("/schools/me/subscription/verify")
def verify_checkout(reference: str, ctx: SchoolContext = Depends(require_admin)):
    """Called by the app after Paystack redirects back. Verifies server-side, never trusts the browser."""
    db = get_supabase()
    payment = first_row(db.table("src_payments").select("*").eq("reference", reference).limit(1))
    if not payment or payment["school_id"] != ctx.school_id:
        raise HTTPException(status_code=404, detail="Unknown payment reference.")
    result = activate_subscription(db, reference)
    return {"state": subscription_state(result["subscription"]), **result}


@router.post("/webhooks/paystack")
async def paystack_webhook(request: Request, x_paystack_signature: str = Header(default="")):
    """Paystack calls this. The signature is verified and each event is processed once."""
    raw = await request.body()
    if not settings.paystack_secret_key:
        raise HTTPException(status_code=503, detail="Payments are not configured.")
    expected = hmac.new(settings.paystack_secret_key.encode(), raw, hashlib.sha512).hexdigest()
    if not x_paystack_signature or not hmac.compare_digest(expected, x_paystack_signature):
        raise HTTPException(status_code=401, detail="Invalid signature.")

    try:
        event = json.loads(raw or b"{}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Malformed event.") from exc

    db = get_supabase()
    event_id = str((event.get("data") or {}).get("id") or (event.get("data") or {}).get("reference") or event.get("event"))
    event_type = event.get("event")

    existing = first_row(
        db.table("src_webhook_events").select("*").eq("provider", "paystack").eq("event_id", event_id).limit(1)
    )
    if existing and existing.get("processed_at"):
        return {"received": True, "duplicate": True}

    if existing:
        record = existing
    else:
        created = (
            db.table("src_webhook_events")
            .insert({"provider": "paystack", "event_id": event_id, "event_type": event_type, "payload": event})
            .execute()
            .data
            or []
        )
        record = created[0] if created else {"id": None}

    if event_type == "charge.success":
        reference = (event.get("data") or {}).get("reference")
        try:
            activate_subscription(db, reference)
        except HTTPException as exc:
            logger.warning("paystack webhook could not activate %s: %s", reference, exc.detail)
            return {"received": True, "activated": False}

    if record.get("id"):
        db.table("src_webhook_events").update({"processed_at": now_iso()}).eq("id", record["id"]).execute()
    return {"received": True, "activated": event_type == "charge.success"}


@router.get("/schools/me/invoices")
def list_invoices(ctx: SchoolContext = Depends(require_admin)):
    db = get_supabase()
    return {"invoices": rows(db.table("src_invoices").select("*").eq("school_id", ctx.school_id).order("created_at", desc=True))}
