"""Small wrapper around the Groq API."""
import json

from fastapi import HTTPException
from groq import Groq

from .config import settings

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)
    return _client


def ask_json(system: str, user: str, temperature: float = 0.4, max_tokens: int = 3000) -> dict:
    """Ask the model for a JSON answer and return it as a Python dict."""
    try:
        completion = _get_client().chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return json.loads(completion.choices[0].message.content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="The AI gave an unreadable answer. Please try again.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The AI request failed: {exc}")


def ask_text(system: str, messages: list[dict], temperature: float = 0.5, max_tokens: int = 800) -> str:
    """Ask the model for a normal text reply (used by the AI Coach)."""
    try:
        completion = _get_client().chat.completions.create(
            model=settings.groq_model,
            messages=[{"role": "system", "content": system}, *messages],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return (completion.choices[0].message.content or "").strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The AI request failed: {exc}")
