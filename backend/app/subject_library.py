"""The built-in subject library for the School Result Compiler.

Schools teach the same subjects year after year, so the common curriculum ships with
PathSync instead of being retyped by every administrator. A school picks from this
list; anything missing is added as a custom subject and stored in that school's own
src_subjects rows, which is what the class, sheet and compilation code already reads.

Keeping the catalogue in code means no migration and no seed step: the list is served
by the backend and can grow without touching the database.
"""
from __future__ import annotations

LIBRARY: list[dict] = [
    {"name": "English Language", "code": "ENG"},
    {"name": "Mathematics", "code": "MTH"},
    {"name": "Basic Science", "code": "BSC"},
    {"name": "Basic Technology", "code": "BTE"},
    {"name": "Social Studies", "code": "SOS"},
    {"name": "Civic Education", "code": "CIV"},
    {"name": "Computer Studies", "code": "CST"},
    {"name": "Business Studies", "code": "BUS"},
    {"name": "Agricultural Science", "code": "AGR"},
    {"name": "Physical and Health Education", "code": "PHE"},
    {"name": "Home Economics", "code": "HEC"},
    {"name": "Christian Religious Studies", "code": "CRS"},
    {"name": "Islamic Religious Studies", "code": "IRS"},
    {"name": "Biology", "code": "BIO"},
    {"name": "Chemistry", "code": "CHM"},
    {"name": "Physics", "code": "PHY"},
    {"name": "Economics", "code": "ECO"},
    {"name": "Government", "code": "GOV"},
    {"name": "Literature in English", "code": "LIT"},
    {"name": "Geography", "code": "GEO"},
]


def normalise(value: str) -> str:
    return " ".join(str(value or "").lower().split())


def search(query: str = "", taken: set[str] | None = None) -> list[dict]:
    """Library subjects matching the query, each marked with whether the school has it."""
    needle = normalise(query)
    have = {normalise(name) for name in (taken or set())}
    results = []
    for subject in LIBRARY:
        if needle and needle not in normalise(subject["name"]) and needle not in normalise(subject["code"]):
            continue
        results.append({**subject, "added": normalise(subject["name"]) in have})
    return results
