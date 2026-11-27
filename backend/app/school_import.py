"""Reading a class register, from a spreadsheet or from a photograph.

Both paths end in the same shape: a list of rows the administrator reviews before
anything is saved. Nothing here writes to the database, and nothing guesses a name:
a name that cannot be read is returned as an empty row flagged for correction.
"""
from __future__ import annotations

import base64
import binascii
import csv
import io
import re

from fastapi import HTTPException

from .ai import ask_vision_json

MAX_BYTES = 8 * 1024 * 1024
NAME_HEADERS = {"name", "names", "student", "student name", "students", "full name", "pupil", "pupil name"}
FIRST_HEADERS = {"first name", "firstname", "first", "given name"}
LAST_HEADERS = {"surname", "last name", "lastname", "last", "family name"}
ADMISSION_HEADERS = {"admission", "admission no", "admission number", "adm", "reg no", "registration no", "student no", "no"}


def _decode(content_base64: str) -> bytes:
    try:
        raw = base64.b64decode(content_base64.split(",")[-1], validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="That file could not be read.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="That file is larger than 8MB. Try a smaller one.")
    return raw


def _text(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _sheet_rows(raw: bytes, filename: str) -> list[list[str]]:
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm", ".xls")):
        try:
            from openpyxl import load_workbook

            book = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(status_code=422, detail="That spreadsheet could not be opened. Save it as .xlsx or .csv.")
        sheet = book[book.sheetnames[0]]
        return [[_text(cell) for cell in row] for row in sheet.iter_rows(values_only=True)]
    text = raw.decode("utf-8-sig", errors="replace")
    return [[_text(cell) for cell in row] for row in csv.reader(io.StringIO(text))]


def _split_name(value: str) -> tuple[str, str]:
    parts = [part for part in value.split(" ") if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def rows_from_spreadsheet(filename: str, content_base64: str) -> dict:
    """Turn a register spreadsheet into reviewable rows.

    The header row is found by looking for a name column, so a sheet with a school
    heading above the table still works. Without a header, the longest wordy cell in
    each row is taken as the name, which is how a plain list of names reads.
    """
    table = _sheet_rows(_decode(content_base64), filename)
    if not table:
        raise HTTPException(status_code=422, detail="That file has no rows.")

    header_index = None
    name_column = None
    first_column = last_column = admission_column = None
    for index, row in enumerate(table[:8]):
        lowered = [cell.lower() for cell in row]
        for column, cell in enumerate(lowered):
            if cell in NAME_HEADERS:
                header_index, name_column = index, column
                break
        if header_index is None:
            if any(cell in FIRST_HEADERS for cell in lowered) and any(cell in LAST_HEADERS for cell in lowered):
                header_index = index
                first_column = next(c for c, cell in enumerate(lowered) if cell in FIRST_HEADERS)
                last_column = next(c for c, cell in enumerate(lowered) if cell in LAST_HEADERS)
        if header_index is not None:
            admission_column = next((c for c, cell in enumerate(lowered) if cell in ADMISSION_HEADERS), None)
            break

    start = 0 if header_index is None else header_index + 1
    out = []
    for row in table[start:]:
        if not any(row):
            continue
        if name_column is not None and name_column < len(row):
            name = row[name_column]
        elif first_column is not None:
            name = " ".join(part for part in (row[first_column] if first_column < len(row) else "",
                                              row[last_column] if last_column is not None and last_column < len(row) else "") if part)
        else:
            words = [cell for cell in row if re.search(r"[A-Za-z]{2,}", cell)]
            name = max(words, key=len) if words else ""
        name = re.sub(r"^\d+[.)]?\s*", "", name).strip()
        if not re.search(r"[A-Za-z]", name):
            continue
        if name.lower() in NAME_HEADERS or name.lower() in FIRST_HEADERS:
            continue
        first, last = _split_name(name)
        admission = ""
        if admission_column is not None and admission_column < len(row):
            admission = row[admission_column]
        out.append({"name": name, "first_name": first, "last_name": last, "admission_no": admission})
    if not out:
        raise HTTPException(status_code=422, detail="No student names were found in that file.")
    return {"rows": out, "source": "spreadsheet"}


VISION_SYSTEM = (
    "You read handwritten school documents. Transcribe only what is visibly written. "
    "Never invent a name, a number or a spelling you cannot see. Reply with JSON only."
)

VISION_PROMPT = (
    "This is a photograph of a handwritten class register or attendance list. "
    "Transcribe every student name in the order written, top to bottom. "
    "If a line also shows an admission number or student number, include it. "
    'Return JSON exactly like {"students": [{"name": "John Okafor", "admission_no": "", '
    '"confidence": 0.9, "note": ""}]} where confidence is your certainty in the spelling '
    "from 0 to 1, and note describes what was unclear when confidence is below 0.7. "
    "If a line is unreadable, still return it with your best partial reading and a low "
    "confidence. Do not add students who are not on the page."
)


def rows_from_photograph(image_base64: str, mime_type: str = "image/jpeg") -> dict:
    """Read names off a photographed register and flag the uncertain ones."""
    raw = _decode(image_base64)
    if len(raw) < 1024:
        raise HTTPException(status_code=422, detail="That image is too small to read. Take a closer photograph.")
    data_url = f"data:{mime_type or 'image/jpeg'};base64,{base64.b64encode(raw).decode()}"
    data = ask_vision_json(VISION_SYSTEM, VISION_PROMPT, data_url, max_tokens=2500)
    students = data.get("students") if isinstance(data, dict) else None
    if not isinstance(students, list) or not students:
        raise HTTPException(status_code=422, detail="No names could be read. Try a brighter, straighter photograph.")

    out = []
    for item in students[:200]:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"))
        if not re.search(r"[A-Za-z]", name):
            out.append({"name": "", "first_name": "", "last_name": "", "admission_no": _text(item.get("admission_no")),
                        "confidence": 0.0, "note": "Unreadable line. Type the name."})
            continue
        try:
            confidence = float(item.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        first, last = _split_name(name)
        out.append(
            {
                "name": name,
                "first_name": first,
                "last_name": last,
                "admission_no": _text(item.get("admission_no")),
                "confidence": max(0.0, min(1.0, confidence)),
                "note": _text(item.get("note")),
            }
        )
    return {"rows": out, "source": "photograph"}
