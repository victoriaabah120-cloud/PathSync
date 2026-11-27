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
    # Vision model used to read handwritten registers and score sheets. It runs on the
    # same Groq key, so no extra credential or billing account is needed.
    # Google AI Studio key for reading photographs of handwritten registers. Optional:
    # without it the app falls back to a Groq vision model, and the spreadsheet import
    # works either way.
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    groq_vision_model: str = os.getenv(
        "GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"
    ).strip()
    frontend_url: str = os.getenv("FRONTEND_URL", PRODUCTION_FRONTEND_URL).strip().rstrip("/")
    paystack_secret_key: str = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
    paystack_public_key: str = os.getenv("PAYSTACK_PUBLIC_KEY", "").strip()
    environment: str = os.getenv("ENVIRONMENT", "development").strip().lower()
    # Testing switch for the School Result Compiler. Only the exact value "true"
    # switches subscriptions and payments off; anything else, including "false", an
    # empty string, a missing variable or a typo, keeps every subscription gate in
    # force. It is read from the server environment, so a browser cannot turn it on
    # and no deployment gets free access by accident. While it is on, no school needs
    # a plan, a payment or spare student capacity. Subscription tables, plans,
    # Paystack, verification, webhooks and payment history are untouched; setting the
    # variable to "false" restores the real system without a code change.
    subscription_test_mode: str = os.getenv("SUBSCRIPTION_TEST_MODE", "false").strip().lower()

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def subscription_test_mode_enabled(self) -> bool:
        return self.subscription_test_mode == "true"

    @property
    def subscriptions_enforced(self) -> bool:
        return not self.subscription_test_mode_enabled

    @property
    def billing_mode(self) -> str:
        return "testing" if self.subscription_test_mode_enabled else "enforced"

    def missing(self) -> list[str]:
        names = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "GROQ_API_KEY": self.groq_api_key,
            "GROQ_MODEL": self.groq_model,
        }
        return [name for name, value in names.items() if not value]


settings = Settings()
