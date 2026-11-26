"""The temporary testing switch that bypasses subscriptions.

SUBSCRIPTION_TEST_MODE=true is the only value that switches the gates off, it
lives in the server environment, and everything else keeps the real subscription
rules in force.
"""
import pathlib
import sys
import types

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

if "supabase" not in sys.modules:
    _stub = types.ModuleType("supabase")
    _stub.Client = object
    _stub.create_client = lambda *args, **kwargs: None
    sys.modules["supabase"] = _stub

from app import school_tenancy
from app.config import settings
from app.school_tenancy import SchoolContext, ensure_active_subscription, ensure_capacity


@pytest.fixture
def enforce(monkeypatch):
    def _set(value):
        monkeypatch.setattr(settings, "subscription_test_mode", value, raising=False)

    return _set


def context(state: str, capacity: int = 100) -> SchoolContext:
    subscription = {
        "id": "sub-1",
        "plan_id": "plan-1",
        "status": state,
        "student_capacity": capacity,
        "current_period_end": "2026-12-26T00:00:00+00:00",
    }
    return SchoolContext(
        user=type("U", (), {"id": "user-1", "email": "admin@example.com"})(),
        school={"id": "school-1", "name": "Test School", "status": "active"},
        member={"id": "member-1", "role": "school_admin"},
        role="school_admin",
        subscription=subscription,
    )


def test_default_is_enforced(monkeypatch):
    monkeypatch.setattr(settings, "subscription_test_mode", "false", raising=False)
    assert settings.subscriptions_enforced is True
    assert settings.billing_mode == "enforced"


def test_only_the_exact_true_value_bypasses(enforce):
    for value in ("false", "0", "yes", "on", "disabled", "TRUE!", "", "True "):
        enforce(value)
        assert settings.subscriptions_enforced is True, value
    enforce("true")
    assert settings.subscriptions_enforced is False


def test_test_mode_switches_the_gates_off(enforce):
    enforce("true")
    assert settings.subscriptions_enforced is False
    assert settings.billing_mode == "testing"
    assert school_tenancy.effective_subscription_state(None) == "active"
    assert school_tenancy.effective_subscription_state({"status": "pending"}) == "active"


def test_pending_school_passes_the_payment_gate_while_testing(enforce):
    enforce("true")
    assert ensure_active_subscription(context("pending"))["id"] == "sub-1"
    assert ensure_capacity(context("pending", capacity=0))["id"] == "sub-1"


def test_pending_school_is_still_blocked_when_enforced(enforce):
    enforce("false")
    with pytest.raises(HTTPException) as caught:
        ensure_active_subscription(context("pending"))
    assert caught.value.status_code == 402


def test_effective_state_matches_the_stored_state_when_enforced(enforce):
    enforce("false")
    assert school_tenancy.effective_subscription_state({"status": "pending"}) == "pending"
    assert school_tenancy.effective_subscription_state({"status": "expired"}) == "expired"
