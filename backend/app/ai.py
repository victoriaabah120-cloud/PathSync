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


def ask_vision_json(
    system: str,
    user: str,
    image_data_url: str,
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> dict:
    """Read an image and answer in JSON. Used for handwritten registers and sheets."""
    try:
        completion = _get_client().chat.completions.create(
            model=settings.groq_vision_model,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": image_data_url}},
                    ],
                },
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return json.loads(completion.choices[0].message.content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="The page could not be read. Try a clearer photograph.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The image could not be read: {exc}")
