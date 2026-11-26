"""PathSync API. Start it with:  uvicorn app.main:app --reload --port 8000"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import PRODUCTION_FRONTEND_URL, settings
from .routers import (
    assessment,
    certificates,
    coach,
    lessons,
    quiz,
    school_admin,
    school_student,
    school_teaching,
    schools,
)

app = FastAPI(title="PathSync API")

# The deployed site is always allowed, so a missing FRONTEND_URL can never lock the
# live app out of the API. Localhost is only added while running locally.
allowed_origins = {settings.frontend_url, PRODUCTION_FRONTEND_URL}
if settings.is_development:
    allowed_origins.update(
        {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=r"https://.*\.app\.github\.dev" if settings.is_development else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# A missing table means the database migration for a module has not been run yet.
# Say so plainly instead of returning an opaque 500.
try:  # postgrest ships with supabase-py
    from postgrest.exceptions import APIError as _PostgrestError

    @app.exception_handler(_PostgrestError)
    async def _database_error(request, exc):
        text = str(exc)
        if getattr(exc, "code", "") == "42P01" or "42P01" in text or "does not exist" in text:
            return JSONResponse(
                status_code=503,
                content={
                    "detail": (
                        "This feature needs a database migration that has not been run yet. "
                        "Run supabase/migrations/2026-11-26-school-result-compiler.sql in Supabase."
                    )
                },
            )
        return JSONResponse(status_code=500, content={"detail": "The database rejected that request."})
except Exception:  # pragma: no cover - postgrest is always present with supabase-py
    pass


@app.get("/health")
def health():
    missing = settings.missing()
    return {"status": "ok" if not missing else "missing settings", "missing": missing}


app.include_router(assessment.router)
app.include_router(lessons.router)
app.include_router(quiz.router)
app.include_router(coach.router)
app.include_router(certificates.router)
app.include_router(schools.router)
app.include_router(school_admin.router)
app.include_router(school_teaching.router)
app.include_router(school_student.router)
