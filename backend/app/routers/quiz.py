from fastapi import APIRouter, Depends, HTTPException

from ..ai import ask_json
from ..auth import get_current_user
from ..schemas import QuizRequest

router = APIRouter(prefix="/quiz", tags=["quiz"])

SYSTEM = (
    "You write fair multiple-choice quizzes for PathSync lessons. Every question must be answerable "
    "from the lesson content. Exactly one option is correct. Reply with JSON only."
)


@router.post("/generate")
def generate_quiz(body: QuizRequest, user=Depends(get_current_user)):
    prompt = (
        f"Lesson: {body.title} (career: {body.specialization}, field: {body.career_field}).\n"
        f"Lesson summary: {body.lesson_summary}\n\n"
        "Write exactly 5 multiple-choice questions. Each has 4 options. "
        "answer_index is the position (0 to 3) of the correct option. Spread the correct answers around.\n"
        "Return JSON in exactly this shape:\n"
        '{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], '
        '"answer_index": 0, "explanation": "one sentence on why the answer is right"}]}'
    )
    data = ask_json(SYSTEM, prompt)

    questions = []
    raw = data.get("questions")
    if isinstance(raw, list):
        for item in raw[:8]:
            if not isinstance(item, dict):
                continue
            options = item.get("options")
            index = item.get("answer_index")
            if (
                item.get("question")
                and isinstance(options, list)
                and len(options) == 4
                and isinstance(index, int)
                and 0 <= index <= 3
            ):
                questions.append(
                    {
                        "question": str(item["question"]),
                        "options": [str(o) for o in options],
                        "answer_index": index,
                        "explanation": str(item.get("explanation", "")),
                    }
                )
    if len(questions) < 3:
        raise HTTPException(status_code=502, detail="The AI did not return a quiz. Please try again.")
    return {"questions": questions}
