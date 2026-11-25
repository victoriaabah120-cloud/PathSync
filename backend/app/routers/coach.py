from fastapi import APIRouter, Depends

from ..ai import ask_text
from ..auth import get_current_user
from ..schemas import CoachRequest

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/chat")
def chat(body: CoachRequest, user=Depends(get_current_user)):
    system = (
        "You are the PathSync AI Coach, a patient expert tutor. "
        f"The learner is studying {body.specialization} (field: {body.career_field}). "
        + (f"Their current lesson is: {body.current_lesson}. " if body.current_lesson else "")
        + "Answer the question directly first, then add the detail that helps the learner understand. "
        "Format every reply as clean Markdown for a narrow chat panel: "
        "use '###' for section headings and never '#', keep paragraphs to two or three sentences, "
        "use '-' bullets for steps, options or examples, put the key term of a sentence in **bold**, "
        "use fenced code blocks with a language tag for code, a Markdown table when comparing things, "
        "and LaTeX between $$ for any formula. "
        "Never write raw HTML, never draw shapes with repeated punctuation, and never leave stray "
        "asterisks, pipes or hashes that are not real Markdown. "
        "You are not a replacement for a qualified professional: for medical, legal or financial "
        "decisions, tell the learner to check with a qualified professional or an official source. "
        "If you are not sure about something, say so. Do not invent facts or sources. "
        "If the learner goes off topic, gently bring them back to their learning."
    )
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = ask_text(system, messages, max_tokens=1500)
    return {"reply": reply or "Sorry, I could not come up with an answer. Please try again."}
