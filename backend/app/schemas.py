"""The shapes of the data the frontend sends to the backend."""
from pydantic import BaseModel, Field


class Answer(BaseModel):
    question: str = Field(max_length=300)
    answers: list[str] = Field(default_factory=list, max_length=6)


class AssessmentRequest(BaseModel):
    answers: list[Answer] = Field(max_length=20)
    free_text: str = Field(default="", max_length=600)


class PathRequest(BaseModel):
    career_field: str = Field(min_length=2, max_length=80)
    specialization: str = Field(min_length=2, max_length=120)


class LessonRequest(PathRequest):
    title: str = Field(min_length=2, max_length=200)
    summary: str = Field(default="", max_length=500)


class QuizRequest(PathRequest):
    title: str = Field(min_length=2, max_length=200)
    lesson_summary: str = Field(default="", max_length=8000)


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=2000)


class CoachRequest(PathRequest):
    current_lesson: str = Field(default="", max_length=200)
    messages: list[ChatMessage] = Field(min_length=1, max_length=14)


class CourseRequest(PathRequest):
    """A whole course is identified by its field and specialisation."""


class AssessmentSubmit(BaseModel):
    assessment_id: str = Field(min_length=8, max_length=64)
    # One index per question. Length and range are checked against the stored exam,
    # so a short or padded sheet is rejected instead of being marked as wrong.
    answers: list[int | None] = Field(min_length=1, max_length=30)
