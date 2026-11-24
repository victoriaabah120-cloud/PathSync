"""PathSync API. Start it with:  uvicorn app.main:app --reload --port 8000"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import assessment, coach, lessons, quiz

app = FastAPI(title="PathSync API")

allowed_origins = [settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.app\.github\.dev" if settings.environment == "development" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    missing = settings.missing()
    return {"status": "ok" if not missing else "missing settings", "missing": missing}


app.include_router(assessment.router)
app.include_router(lessons.router)
app.include_router(quiz.router)
app.include_router(coach.router)
