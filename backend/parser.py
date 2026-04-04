"""
Syllabus PDF parsing for BoilerGPA.
Uses PyMuPDF to extract text + tables, then sends to Gemini for structured extraction.
"""

import json
import os
import re
import logging
from pathlib import Path

import fitz  # PyMuPDF
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """You are an expert academic syllabus parser. Your ONLY job is to extract grading information from course syllabi and return it as a single valid JSON object — no markdown, no backticks, no preamble, no explanation. Just raw JSON.

Extract and return exactly this structure:
{
  "course_name": "<full course name and number>",
  "instructor": "<professor/instructor name>",
  "grading_scale": {
    "A": <minimum percentage for A, e.g. 90>,
    "B": <minimum percentage for B, e.g. 80>,
    "C": <minimum percentage for C, e.g. 70>,
    "D": <minimum percentage for D, e.g. 60>
  },
  "categories": [
    {
      "name": "<category name, e.g. Exams, Homework, Labs, Quizzes, Projects, Participation>",
      "weight": <weight as a number 0-100, e.g. 40>,
      "count": <number of items in this category, e.g. 3>
    }
  ],
  "course_code": "<alphanumeric course code, no spaces, e.g. CS25100 or MA26100>",
  "credit_hours": <number of credit hours, default 3 if not found>
}

RULES:
- Weights must sum to 100. If they don't, normalize them proportionally.
- If the grading scale uses +/- grades (e.g. A: 93, A-: 90), only include the base letter cutoffs (A, B, C, D).
- course_code must be a clean identifier like CS25100, MA26100, ECE20001 — no spaces or dashes.
- If a field truly cannot be determined, use a sensible default (e.g. instructor: "Staff", credit_hours: 3).
- Tables in the syllabus are formatted as markdown — use them; they are the most reliable source of grading data.
- Return ONLY valid JSON. Any non-JSON output will break the application."""


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def _table_to_markdown(table) -> str:
    """Convert a PyMuPDF table object to a markdown table string."""
    rows = table.extract()
    if not rows:
        return ""

    md = []
    for i, row in enumerate(rows):
        cells = [str(c or "").replace("\n", " ").strip() for c in row]
        md.append("| " + " | ".join(cells) + " |")
        if i == 0:
            md.append("|" + "---|" * len(cells))

    return "\n".join(md)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract text from a PDF with special handling for tables.

    Strategy:
      1. For each page, extract plain text via get_text("text").
      2. Also run find_tables() — Purdue syllabi almost always put grading in a table.
         Tables are formatted as markdown so Gemini can read the structure clearly.
      3. Combine both for each page so Gemini gets full context.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Plain text (sorted by reading order)
        text = page.get_text("text", sort=True).strip()

        # Tables → markdown
        table_blocks = []
        try:
            found = page.find_tables()
            for tbl in found.tables:
                md = _table_to_markdown(tbl)
                if md:
                    table_blocks.append(md)
        except Exception as e:
            logger.debug(f"Table extraction failed on page {page_num + 1}: {e}")

        parts = []
        if text:
            parts.append(text)
        if table_blocks:
            parts.append("[TABLES]\n" + "\n\n".join(table_blocks))

        if parts:
            pages.append(f"[Page {page_num + 1}]\n" + "\n\n".join(parts))

    page_count = doc.page_count
    doc.close()

    full_text = "\n\n".join(pages)
    logger.info(f"Extracted {len(full_text)} chars from {len(pages)}/{page_count} pages")
    return full_text


# ---------------------------------------------------------------------------
# Gemini parsing
# ---------------------------------------------------------------------------

def strip_json_fences(text: str) -> str:
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    return text.strip()


def parse_syllabus_with_gemini(syllabus_text: str) -> dict:
    """
    Send extracted syllabus text to Gemini and return structured data.
    Raises ValueError if the response can't be parsed as JSON.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable not set")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=0.1,
            max_output_tokens=4096,
        ),
    )

    # Keep more of the document — tables near the end matter
    # Tables section is always included even if we truncate the plain text
    MAX_CHARS = 20000
    if len(syllabus_text) > MAX_CHARS:
        # Always keep the last 4000 chars (often where grading lives) + first chunk
        head = syllabus_text[:MAX_CHARS - 4000]
        tail = syllabus_text[-4000:]
        syllabus_text = head + "\n\n[...truncated...]\n\n" + tail
        logger.warning(f"Syllabus truncated to {MAX_CHARS} chars")

    prompt = (
        "Parse the following course syllabus and extract the grading information as JSON.\n"
        "Pay special attention to any [TABLES] sections — they contain the most reliable grading data.\n\n"
        f"SYLLABUS TEXT:\n{syllabus_text}"
    )

    logger.info("Sending syllabus to Gemini for parsing...")
    response = model.generate_content(prompt)
    raw = response.text
    logger.info(f"Gemini response (first 300 chars): {raw[:300]}")

    cleaned = strip_json_fences(raw)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        # One retry: ask Gemini to fix its own output
        logger.warning(f"First parse failed ({e}), retrying with repair prompt...")
        repair_prompt = (
            f"The following is supposed to be valid JSON but has a syntax error: {e}\n\n"
            f"{cleaned[:3000]}\n\nReturn ONLY the corrected valid JSON, nothing else."
        )
        repair_resp = model.generate_content(repair_prompt)
        cleaned2 = strip_json_fences(repair_resp.text)
        try:
            parsed = json.loads(cleaned2)
        except json.JSONDecodeError as e2:
            logger.error(f"Repair attempt also failed: {e2}\nRaw: {raw[:500]}")
            raise ValueError(f"Gemini returned invalid JSON even after repair: {e2}") from e2

    return normalize_parsed_syllabus(parsed)


def normalize_parsed_syllabus(data: dict) -> dict:
    """Validate and normalize parsed syllabus data."""
    data.setdefault("course_name", "Unknown Course")
    data.setdefault("instructor", "Staff")
    data.setdefault("course_code", "UNKNOWN")
    data.setdefault("credit_hours", 3)
    data.setdefault("grading_scale", {"A": 90, "B": 80, "C": 70, "D": 60})

    scale = data["grading_scale"]
    scale.setdefault("A", 90)
    scale.setdefault("B", 80)
    scale.setdefault("C", 70)
    scale.setdefault("D", 60)

    categories = data.get("categories", [])
    if categories:
        total_weight = sum(float(c.get("weight", 0)) for c in categories)
        if total_weight > 0 and abs(total_weight - 100) > 1:
            logger.warning(f"Category weights sum to {total_weight:.1f}, normalizing to 100")
            for cat in categories:
                cat["weight"] = round(float(cat.get("weight", 0)) / total_weight * 100, 2)

    data["categories"] = categories
    return data


async def parse_syllabus_pdf(pdf_bytes: bytes) -> dict:
    """Full pipeline: PDF bytes → extract text+tables → Gemini → structured JSON."""
    raw_text = extract_text_from_pdf(pdf_bytes)

    if not raw_text.strip():
        raise ValueError(
            "Could not extract any text from the PDF. "
            "The file may be a scanned/image-only document."
        )

    return parse_syllabus_with_gemini(raw_text)
