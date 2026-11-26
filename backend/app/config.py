"""Reads settings from environment variables (backend/.env)."""
import os

from dotenv import load_dotenv

load_dotenv()

# The deployed site. Used for CORS and for links the API builds.
PRODUCTION_FRONTEND_URL = "https://pathsync-frontend-ddee.onrender.com"


class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "").strip()
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
    groq_model: str = os.getenv("GROQ_MODEL", "").strip()
    frontend_url: str = os.getenv("FRONTEND_URL", PRODUCTION_FRONTEND_URL).strip().rstrip("/")
    paystack_secret_key: str = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
    paystack_public_key: str = os.getenv("PAYSTACK_PUBLIC_KEY", "").strip()
    environment: str = os.getenv("ENVIRONMENT", "development").strip().lower()
    # Subscription enforcement. The default, "enforced", applies every subscription
    # gate. Only the exact value "disabled" switches the gates off, which is the
    # testing mode used while the result compiler is being evaluated: no plan, no
    # payment, no student capacity limit. It is read from the server environment, so
    # a browser cannot turn it on, and any other value (including a typo) keeps the
    # gates in force. Subscription tables, plans, Paystack and payment history are
    # untouched either way; restoring "enforced" brings the real system back.
    subscription_enforcement: str = os.getenv("SUBSCRIPTION_ENFORCEMENT", "enforced").strip().lower()

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def subscriptions_enforced(self) -> bool:
        return self.subscription_enforcement != "disabled"

    @property
    def billing_mode(self) -> str:
        return "enforced" if self.subscriptions_enforced else "testing"

    def missing(self) -> list[str]:
        names = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "GROQ_API_KEY": self.groq_api_key,
            "GROQ_MODEL": self.groq_model,
        }
        return [name for name, value in names.items() if not value]


settings = Settings()
