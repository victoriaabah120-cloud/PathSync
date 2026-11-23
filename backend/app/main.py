import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="PathSync API",
    description="API powering the PathSync career development platform.",
    version="1.0.0",
)

frontend_url = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "application": "PathSync",
        "message": "Welcome to the PathSync API",
        "status": "running",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Backend connected successfully",
    }


@app.get("/api/careers")
def get_careers():
    return {
        "careers": [
            {
                "id": 1,
                "category": "Technology",
                "specializations": [
                    "Software Engineering",
                    "Data Science",
                    "Artificial Intelligence",
                    "Cybersecurity",
                    "Cloud Computing",
                    "Web Development",
                    "Mobile Development",
                    "UI/UX Design",
                ],
            },
            {
                "id": 2,
                "category": "Engineering",
                "specializations": [
                    "Civil Engineering",
                    "Mechanical Engineering",
                    "Electrical Engineering",
                    "Chemical Engineering",
                    "Computer Engineering",
                    "Petroleum Engineering",
                    "Aerospace Engineering",
                ],
            },
            {
                "id": 3,
                "category": "Business and Finance",
                "specializations": [
                    "Accounting",
                    "Business Administration",
                    "Financial Analysis",
                    "Marketing",
                    "Entrepreneurship",
                ],
            },
            {
                "id": 4,
                "category": "Creative Arts",
                "specializations": [
                    "Graphic Design",
                    "Animation",
                    "Photography",
                    "Content Creation",
                ],
            },
            {
                "id": 5,
                "category": "Health and Life Sciences",
                "specializations": [
                    "Public Health",
                    "Biotechnology",
                    "Medical Laboratory Science",
                    "Health Administration",
                ],
            },
        ]
    }
