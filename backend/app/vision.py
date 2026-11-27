"""Reading a photographed document.

The provider is chosen from the server environment, never from the browser:

- GEMINI_API_KEY (Google AI Studio, free tier) reads handwriting well and is preferred.
- Otherwise the Groq key is used if it exposes a vision model.

With neither available the call fails with a clear message rather than pretending to
read the page, and the spreadsheet import keeps working on its own.
"""
from __future__ import annotations

import base64
import json

import httpx
from fastapi import HTTPException

from .ai import ask_vision_json
from .config import settings

GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def gemini_key() -> str:
    return (settings.gemini_api_key or "").strip()


def provider() -> str:
    return "gemini" if gemini_key() else "groq"


def _split_data_url(data_url: str) -> tuple[str, str]:
    header, _, payload = data_url.partition(",")
    mime = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
    return mime, payload


def _read_with_gemini(system: str, prompt: str, data_url: str, max_tokens: int) -> dict:
    mime, payload = _split_data_url(data_url)
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime, "data": payload}},
                ],
            }
        ],
        "generationConfig": {"response_mime_type": "application/json", "maxOutputTokens": max_tokens, "temperature": 0.1},
    }
    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(GEMINI_URL, params={"key": gemini_key()}, json=body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The image could not be read: {exc}")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="The photo reader is busy. Wait a minute and try again.")
    if response.status_code >= 400:
        detail = response.text[:200]
        raise HTTPException(status_code=502, detail=f"The image could not be read: {detail}")
    data = response.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="The page could not be read. Try a clearer photograph.")


def read_image_json(system: str, prompt: str, data_url: str, max_tokens: int = 2500) -> dict:
    if gemini_key():
        return _read_with_gemini(system, prompt, data_url, max_tokens)
    try:
        return ask_vision_json(system, prompt, data_url, max_tokens=max_tokens)
    except HTTPException as exc:
        if exc.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail="Reading photographs is not configured on this server yet. "
                "An administrator can add a GEMINI_API_KEY in Render, or import the list as a spreadsheet.",
            )
        raise
