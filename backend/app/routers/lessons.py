from fastapi import APIRouter, Depends, HTTPException

from ..ai import ask_json
from ..auth import get_current_user
from ..schemas import LessonRequest, PathRequest

router = APIRouter(tags=["lessons"])

SYSTEM = (
    "You are an expert teacher writing for PathSync, a learning platform for people in all professions. "
    "Write in plain, friendly language for a beginner. Be accurate. Never invent statistics, laws, "
    "quotes or sources. Where rules or practices differ by country, say so. Reply with JSON only."
)


@router.post("/path/generate")
def generate_path(body: PathRequest, user=Depends(get_current_user)):
    prompt = (
        f"Create a beginner-to-job-ready learning path for: {body.specialization} (field: {body.career_field}).\n"
        "Write exactly 6 lessons in a sensible order. Each lesson builds on the one before it.\n"
        "Return JSON in exactly this shape:\n"
        '{"lessons": [{"title": "short lesson title", "summary": "one sentence on what the learner will understand"}]}'
    )
    data = ask_json(SYSTEM, prompt)
    lessons = []
    raw = data.get("lessons")
    if isinstance(raw, list):
        for item in raw[:8]:
            if isinstance(item, dict) and item.get("title"):
                lessons.append({"title": str(item["title"]), "summary": str(item.get("summary", ""))})
    if len(lessons) < 3:
        raise HTTPException(status_code=502, detail="The AI did not return a learning path. Please try again.")
    return {"lessons": lessons}


@router.post("/lessons/generate")
def generate_lesson(body: LessonRequest, user=Depends(get_current_user)):
    prompt = (
        f"Write the lesson '{body.title}' for a learner studying {body.specialization} (field: {body.career_field}).\n"
        f"What the lesson should cover: {body.summary or body.title}.\n"
        "Make it 3 or 4 sections. Each section body is 2 short paragraphs separated by a blank line. "
        "Use simple words and a practical example.\n"
        "Return JSON in exactly this shape:\n"
        '{"intro": "2 sentences", "sections": [{"heading": "...", "body": "..."}], '
        '"key_points": ["4 or 5 short takeaways"]}'
    )
    data = ask_json(SYSTEM, prompt, max_tokens=3500)
    sections = []
    raw = data.get("sections")
    if isinstance(raw, list):
        for item in raw[:5]:
            if isinstance(item, dict) and item.get("heading") and item.get("body"):
                sections.append({"heading": str(item["heading"]), "body": str(item["body"])})
    if not sections:
        raise HTTPException(status_code=502, detail="The AI did not return a lesson. Please try again.")
    return {
        "intro": str(data.get("intro", "")),
        "sections": sections,
        "key_points": [str(p) for p in data.get("key_points", [])][:6],
    }
