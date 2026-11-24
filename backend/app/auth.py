"""Checks that a request comes from a logged-in PathSync user."""
from fastapi import Header, HTTPException
from supabase import Client, create_client

from .config import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def get_current_user(authorization: str = Header(default="")):
    """Reads the 'Authorization: Bearer <token>' header and asks Supabase who it belongs to."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in first.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        user = get_supabase().auth.get_user(token).user
    except Exception:
        raise HTTPException(status_code=401, detail="Your login has expired. Please log in again.")
    if user is None:
        raise HTTPException(status_code=401, detail="Your login has expired. Please log in again.")
    return user
