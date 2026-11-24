"""Reads settings from environment variables (backend/.env)."""
import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "").strip()
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
    groq_model: str = os.getenv("GROQ_MODEL", "").strip()
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
    environment: str = os.getenv("ENVIRONMENT", "development").strip()

    def missing(self) -> list[str]:
        names = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "GROQ_API_KEY": self.groq_api_key,
            "GROQ_MODEL": self.groq_model,
        }
        return [name for name, value in names.items() if not value]


settings = Settings()
