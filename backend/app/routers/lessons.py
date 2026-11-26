from fastapi import APIRouter, Depends, HTTPException

from ..ai import ask_json
from ..auth import get_current_user
from ..schemas import LessonRequest, PathRequest

router = APIRouter(tags=["lessons"])

SYSTEM = (
    "You are an expert teacher writing for PathSync, a learning platform for people in all professions. "
    "Teach the subject properly: define every term, explain how things work and why, give worked "
    "examples, and never settle for a summary. Write clearly enough for a motivated beginner, without "
    "sacrificing accuracy or skipping concepts. Never invent statistics, laws, quotes or sources. "
    "Where rules or practices differ by country, say so. Reply with JSON only."
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
        f"Write a complete, in-depth lesson titled '{body.title}' for a learner studying "
        f"{body.specialization} (field: {body.career_field}).\n"
        f"What this lesson must cover: {body.summary or body.title}.\n\n"
        "Write it the way a strong textbook chapter is written: teach the topic properly from the "
        "foundations up to a confident working understanding, at the level of someone starting this "
        "course. Aim for 1600 to 2400 words in total. Do not pad with repetition, motivational filler "
        "or obvious statements, and do not stop early. Every paragraph must teach something new.\n\n"
        "Write developed paragraphs, not fragments. A paragraph should carry one idea through three to "
        "six sentences: state the idea, explain how or why it works, and show what it means in practice. "
        "Never leave a concept named but unexplained, and never use a one-line paragraph as a heading.\n\n"
        "Use clean Markdown inside the text fields: short paragraphs, '-' bullet lists, **bold** for "
        "the first use of a key term, fenced code blocks with a language tag for code, and a Markdown "
        "table when comparing options. Use LaTeX between $$ for any formula. Never write raw HTML.\n\n"
        "Cover, in this order:\n"
        "1. objectives: 3 to 5 sentences starting with a verb, each naming something the learner will "
        "be able to do afterwards.\n"
        "2. introduction: 3 or 4 paragraphs. Why the topic matters, where it is used, the background "
        "the learner needs before the details, and a plain-language overview of what the chapter "
        "covers and how it fits together.\n"
        "3. sections: 5 to 7 sections. Each has a heading and a body of 3 to 5 developed paragraphs "
        "that explains one idea fully: what it is, the exact terminology, how it works, why it matters, "
        "how it connects to the ideas around it, and where it is used in practice. Define each key term "
        "in one clear sentence the first time it appears, then use it consistently. Include the "
        "mechanisms and the principles behind the rules, not just the rules, and add a concrete "
        "illustration wherever a definition alone would leave the idea abstract.\n"
        "4. examples: 2 or 3 worked examples with a title and a body of two or three paragraphs. Show "
        "the steps, the reasoning between the steps and the result, then explain why that approach "
        "works and how it would change in a slightly different case. Use a realistic scenario from the "
        "field; use code when the topic is programming.\n"
        "5. common_mistakes: 3 or 4 items, each with 'mistake' (what learners get wrong) and 'fix' "
        "(how to avoid it or correct it).\n"
        "6. key_takeaways: 5 or 6 short sentences that recap the most important ideas.\n"
        "7. practice: 3 questions that test real understanding (not recall of a definition), each "
        "with an 'answer' that explains the reasoning.\n"
        "8. further_learning: 3 short suggestions for what to study next, phrased as topics or skills "
        "(do not invent book titles, courses, statistics or URLs).\n\n"
        "Accuracy rules: never invent statistics, studies, laws, prices or sources. Where practice "
        "differs by country or employer, say so plainly. If a widely repeated claim is uncertain, say "
        "it is uncertain.\n\n"
        "Return JSON in exactly this shape:\n"
        '{"objectives": ["..."], "introduction": "markdown", '
        '"sections": [{"heading": "...", "body": "markdown"}], '
        '"examples": [{"title": "...", "body": "markdown"}], '
        '"common_mistakes": [{"mistake": "...", "fix": "..."}], '
        '"key_takeaways": ["..."], "practice": [{"question": "...", "answer": "markdown"}], '
        '"further_learning": ["..."]}'
    )
    data = ask_json(SYSTEM, prompt, temperature=0.45, max_tokens=6000)

    sections = []
    for item in data.get("sections") or []:
        if isinstance(item, dict) and item.get("heading") and item.get("body"):
            sections.append({"heading": str(item["heading"]), "body": str(item["body"])})
    if not sections:
        raise HTTPException(status_code=502, detail="The AI did not return a lesson. Please try again.")

    def text_list(key, limit):
        raw = data.get(key)
        if not isinstance(raw, list):
            return []
        return [str(item).strip() for item in raw if str(item).strip()][:limit]

    def object_list(key, limit, fields):
        raw = data.get(key)
        if not isinstance(raw, list):
            return []
        rows = []
        for item in raw:
            if isinstance(item, dict) and any(item.get(f) for f in fields):
                rows.append({f: str(item.get(f, "")).strip() for f in fields})
            elif isinstance(item, str) and item.strip():
                rows.append({fields[0]: item.strip(), **{f: "" for f in fields[1:]}})
        return rows[:limit]

    introduction = str(data.get("introduction") or data.get("intro") or "").strip()
    takeaways = text_list("key_takeaways", 6) or text_list("key_points", 6)

    return {
        "objectives": text_list("objectives", 5),
        "introduction": introduction,
        "sections": sections[:7],
        "examples": object_list("examples", 3, ["title", "body"]),
        "common_mistakes": object_list("common_mistakes", 4, ["mistake", "fix"]),
        "key_takeaways": takeaways,
        "practice": object_list("practice", 3, ["question", "answer"]),
        "further_learning": text_list("further_learning", 3),
        # kept so older screens and stored lessons keep working
        "intro": introduction,
        "key_points": takeaways,
    }
