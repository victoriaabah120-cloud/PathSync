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


# Vision models are tried in this order. Which ones a key can use depends on the
# account, so the first that answers is remembered for the rest of the process.
VISION_CANDIDATES = (
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-vl-235b-a22b-instruct",
    "qwen/qwen2.5-vl-72b-instruct",
)

_vision_model: str | None = None


VISION_HINTS = ("vision", "-vl", "llama-4", "maverick", "scout", "pixtral", "gemma-3")


def available_models() -> list[str]:
    """Every model id the configured key can use, as the provider reports them."""
    try:
        return [getattr(model, "id", "") for model in _get_client().models.list().data]
    except Exception:
        return []


def available_vision_models() -> list[str]:
    return [name for name in available_models() if any(hint in name.lower() for hint in VISION_HINTS)]


def vision_models() -> list[str]:
    """Configured model first, then anything the key reports as vision-capable."""
    if _vision_model:
        return [_vision_model]
    candidates = [settings.groq_vision_model, *available_vision_models(), *VISION_CANDIDATES]
    return [name for name in dict.fromkeys(candidates) if name]


def ask_vision_json(
    system: str,
    user: str,
    image_data_url: str,
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> dict:
    """Read an image and answer in JSON. Used for handwritten registers and sheets."""
    global _vision_model
    tried: list[str] = []
    for model in vision_models():
        try:
            completion = _get_client().chat.completions.create(
                model=model,
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
            _vision_model = model
            return json.loads(completion.choices[0].message.content)
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="The page could not be read. Try a clearer photograph.")
        except Exception as exc:
            message = str(exc).lower()
            unavailable = any(
                token in message
                for token in ("model_not_found", "does not exist", "do not have access", "decommissioned", "not supported")
            )
            tried.append(f"{model}: {str(exc)[:80]}")
            if unavailable:
                continue
            raise HTTPException(status_code=502, detail=f"The image could not be read: {exc}")
    raise HTTPException(
        status_code=503,
        detail="No vision model is available on this Groq key. Set GROQ_VISION_MODEL to one the key can use. "
        + " | ".join(tried[-2:]),
    )
