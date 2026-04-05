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
import anthropic
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)

# Haiku is fast and cheap — good enough for structured extraction
CLAUDE_MODEL = "claude-haiku-4-5-20251001"
# Hard cap on output tokens — parsed JSON is never large, keeps costs low
MAX_OUTPUT_TOKENS = 1024
# Input cap — most syllabi are 10-50k chars ≈ 3-12k tokens
# At Haiku pricing ($0.80/M input tokens) a 50k char doc costs ~$0.01
MAX_INPUT_CHARS = 60_000

GRADING_KEYWORDS = [
    "grading", "grade breakdown", "evaluation", "assessment",
    "point distribution", "course grade", "grade distribution",
    "weights", "assessment weights", "3.1", "course grade",
]

SYSTEM_PROMPT = """You are a structured data extractor for university syllabuses. Your only job is to extract grading information and return valid JSON — nothing else.

Rules:
- Return ONLY a raw JSON object. No markdown, no backticks, no explanation.
- weights must be decimals (0.20 not 20%). All weights must sum to 1.0. If they don't, infer the missing weight from context or flag it in warnings[].
- If a component covers multiple items (e.g. Homework 1–10), return it as one entry with the total weight and set count to the number of items.
- If a drop policy exists (e.g. "drop lowest quiz"), set drop_lowest to the number dropped.
- If professor name is not found, return null.
- If grading scale is not found, return null for grading_scale.
- If weights are given as points (e.g. "200 points out of 800 total"), convert to decimal percentages.
- If you find a component but are unsure of its category, use "other" and explain in notes.
- Set parsing_confidence to "low" if weights don't sum to 1.0, if you had to infer anything major, or if the syllabus is ambiguous. Set to "high" only if everything is explicit and clean.
- Add any ambiguities, assumptions, or missing data to the warnings array as plain strings.

Return this exact JSON schema:
{"course_name":"string","professor":"string or null","grading_components":[{"name":"string","category":"exam or final or homework or project or participation or other","weight":0.0,"count":null,"drop_lowest":null,"notes":"string or null"}],"grading_scale":{"A":90,"B":80,"C":70,"D":60},"parsing_confidence":"high or medium or low","warnings":[]}

EXAMPLE 1 INPUT:
Grading: Homework (25%), Midterm 1 (20%), Midterm 2 (20%), Final Exam (30%), Participation (5%)
Grading Scale: A: 90+, B: 80+, C: 70+, D: 60+

EXAMPLE 1 OUTPUT:
{"course_name":"...","professor":null,"grading_components":[{"name":"Homework","category":"homework","weight":0.25,"count":null,"drop_lowest":null,"notes":null},{"name":"Midterm 1","category":"exam","weight":0.20,"count":null,"drop_lowest":null,"notes":null},{"name":"Midterm 2","category":"exam","weight":0.20,"count":null,"drop_lowest":null,"notes":null},{"name":"Final Exam","category":"final","weight":0.30,"count":null,"drop_lowest":null,"notes":null},{"name":"Participation","category":"participation","weight":0.05,"count":null,"drop_lowest":null,"notes":null}],"grading_scale":{"A":90,"B":80,"C":70,"D":60},"parsing_confidence":"high","warnings":[]}

EXAMPLE 2 INPUT:
Your grade consists of: 10 weekly quizzes worth 10 points each (lowest 2 dropped), a group project (150pts), and a final exam (200pts). Total: 380 points possible after drops.

EXAMPLE 2 OUTPUT:
{"course_name":"...","professor":null,"grading_components":[{"name":"Weekly Quizzes","category":"exam","weight":0.21,"count":10,"drop_lowest":2,"notes":"10 pts each, lowest 2 dropped, 80pts counted"},{"name":"Group Project","category":"project","weight":0.39,"count":null,"drop_lowest":null,"notes":"150 points"},{"name":"Final Exam","category":"final","weight":0.40,"count":null,"drop_lowest":null,"notes":"200 points"}],"grading_scale":null,"parsing_confidence":"medium","warnings":["Weights converted from points: 380 total possible after drops"]}"""


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def _table_to_markdown(table) -> str:
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
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text", sort=True).strip()
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
# Pre-processing: extract grading-relevant section
# ---------------------------------------------------------------------------

def extract_grading_section(text: str) -> str:
    """
    Find the grading section by looking for structural section headers
    (e.g. 'assessment weights', '3.1') — these are specific enough to not
    false-match boilerplate like 'grading policies' near the end of the doc.

    Falls back to the last % sign in the document if no header found,
    which anchors us near the actual numbers.
    Returns everything from the match to end of document.
    """
    lower = text.lower()

    # Tier 1: specific structural headers — much less likely to appear in boilerplate
    structural = ["assessment weights", "3.1", "grade breakdown", "grading breakdown", "grade distribution"]
    best = -1
    for kw in structural:
        idx = lower.rfind(kw)
        if idx > best:
            best = idx

    # Tier 2: last percentage sign — anchor near the actual numbers
    if best == -1:
        pct_idx = lower.rfind('%')
        if pct_idx != -1:
            best = max(0, pct_idx - 1000)

    # Tier 3: generic grading keywords (risky — can match boilerplate)
    if best == -1:
        for kw in GRADING_KEYWORDS:
            idx = lower.rfind(kw)
            if idx > best:
                best = idx

    if best == -1:
        logger.info("No grading section found — using full text")
        return text

    start = max(0, best - 200)
    section = text[start:]
    logger.info(f"Grading section at char {best} of {len(text)}")
    return section


def extract_percentages_from_layout(pdf_bytes: bytes) -> str:
    """
    Reconstruct percentage-label pairs from PDF word layout data.
    Handles pie charts and other visual layouts where percentages appear as
    floating annotations rather than in paragraphs or tables.
    Each token matching \\d+% is associated with surrounding word context.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pairs = []
    for page in doc:
        words = page.get_text("words")  # (x0, y0, x1, y1, word, block, line, word_idx)
        for i, w in enumerate(words):
            if re.match(r'\d+%', w[4]):
                context = [words[j][4] for j in range(max(0, i - 3), min(len(words), i + 4))]
                pairs.append(" ".join(context))
    doc.close()
    return "\n".join(pairs)


# ---------------------------------------------------------------------------
# Gemini parsing
# ---------------------------------------------------------------------------

def strip_json_fences(text: str) -> str:
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    return text.strip()


def _claude_call(client: anthropic.Anthropic, messages: list[dict]) -> str:
    """Single Claude API call with hard output token cap."""
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text


def parse_syllabus_with_claude(syllabus_text: str, pct_pairs: str = "") -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY environment variable not set")

    client = anthropic.Anthropic(api_key=api_key)

    # Build prompt: header + proximity pairs (always included) + grading section
    MAX_HEADER = 2000
    grading_section = extract_grading_section(syllabus_text)
    header = syllabus_text[:MAX_HEADER] if len(syllabus_text) > MAX_HEADER else ""

    parts = []
    if header and grading_section != syllabus_text:
        parts.append("[DOCUMENT HEADER — use for course_name and professor]\n" + header)

    # Proximity pairs go BEFORE the grading section so they survive any truncation
    if pct_pairs:
        parts.append(
            "[PERCENTAGE PAIRS FROM VISUAL LAYOUT — "
            "use these weights if the grading section text is ambiguous or scattered]\n"
            + pct_pairs
        )

    parts.append("[GRADING SECTION]\n" + grading_section)
    prompt_text = "\n\n".join(parts)

    if len(prompt_text) > MAX_INPUT_CHARS:
        prompt_text = prompt_text[:MAX_INPUT_CHARS]
        logger.warning(f"Input truncated to {MAX_INPUT_CHARS} chars")

    user_msg = f"Extract the grading information from this syllabus and return only valid JSON.\n\n{prompt_text}"

    logger.info("Sending syllabus to Claude for parsing...")
    raw = _claude_call(client, [{"role": "user", "content": user_msg}])
    logger.info(f"Claude response (first 300 chars): {raw[:300]}")

    # Step 1: Parse JSON — retry once if invalid
    cleaned = strip_json_fences(raw)
    parsed = None
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse failed ({e}), retrying with repair prompt...")
        raw2 = _claude_call(client, [
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "Your previous response was not valid JSON. Return only the raw JSON object with no other text."},
        ])
        cleaned2 = strip_json_fences(raw2)
        try:
            parsed = json.loads(cleaned2)
        except json.JSONDecodeError as e2:
            logger.error(f"Repair also failed: {e2}")
            raise ValueError(f"Could not parse Claude response as JSON: {e2}") from e2

    # Step 2: Validate weight sum — retry once if off by more than 3%
    components = parsed.get("grading_components", [])
    if components:
        weight_sum = sum(float(c.get("weight", 0)) for c in components)
        if abs(weight_sum - 1.0) > 0.03:
            logger.warning(f"Weights sum to {weight_sum:.3f}, requesting fix...")
            prev_json = json.dumps(parsed)
            raw3 = _claude_call(client, [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": prev_json},
                {"role": "user", "content": (
                    f"Your returned weights sum to {weight_sum:.2f}. They must sum to 1.0. "
                    "Identify the missing or incorrect component and fix it. "
                    "Return only the corrected JSON."
                )},
            ])
            cleaned3 = strip_json_fences(raw3)
            try:
                parsed = json.loads(cleaned3)
            except json.JSONDecodeError:
                if "warnings" not in parsed:
                    parsed["warnings"] = []
                parsed["warnings"].append(
                    f"Grading weights sum to {weight_sum:.0%} instead of 100% — please verify"
                )
                parsed["parsing_confidence"] = "low"

    return normalize_parsed_syllabus(parsed)


# ---------------------------------------------------------------------------
# Normalization: new schema → app-compatible format
# ---------------------------------------------------------------------------

def normalize_parsed_syllabus(data: dict) -> dict:
    """Convert from grading_components schema to app categories format."""
    course_name = (data.get("course_name") or "").strip()

    # Derive course_code from course_name (e.g. "CS 25200" → "CS25200")
    course_code = ""
    code_match = re.search(r'\b([A-Z]{2,4})\s*(\d{3,5})\b', course_name)
    if code_match:
        course_code = code_match.group(1) + code_match.group(2)

    # Convert grading_components → categories (weight decimal → percent)
    components = data.get("grading_components") or []
    categories = []
    for comp in components:
        weight_decimal = float(comp.get("weight") or 0)
        weight_pct = round(weight_decimal * 100, 2)
        count = int(comp.get("count") or 1)
        categories.append({
            "name": comp.get("name") or "",
            "weight": weight_pct,
            "count": count,
            "drop_lowest": comp.get("drop_lowest"),
            "notes": comp.get("notes"),
            "category": comp.get("category") or "other",
        })

    # Grading scale
    raw_scale = data.get("grading_scale")
    if raw_scale and isinstance(raw_scale, dict):
        grading_scale = {
            "A": int(raw_scale.get("A", 90)),
            "B": int(raw_scale.get("B", 80)),
            "C": int(raw_scale.get("C", 70)),
            "D": int(raw_scale.get("D", 60)),
        }
    else:
        grading_scale = {"A": 90, "B": 80, "C": 70, "D": 60}

    return {
        "course_name": course_name,
        "course_code": course_code,
        "instructor": (data.get("professor") or "Staff").strip() or "Staff",
        "credit_hours": int(data.get("credit_hours") or 3),
        "grading_scale": grading_scale,
        "categories": categories,
        "parsing_confidence": data.get("parsing_confidence") or "medium",
        "warnings": data.get("warnings") or [],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def parse_syllabus_pdf(pdf_bytes: bytes) -> dict:
    """Full pipeline: PDF bytes → extract text+tables → Claude → structured JSON."""
    raw_text = extract_text_from_pdf(pdf_bytes)
    if not raw_text.strip():
        raise ValueError(
            "Could not extract any text from the PDF. "
            "The file may be a scanned/image-only document."
        )

    # Always run the word-proximity extractor.
    # Reconstructs percentage-label pairs from the PDF's spatial layout —
    # essential for pie charts / scattered visual layouts (e.g. CS 251).
    pct_pairs = extract_percentages_from_layout(pdf_bytes)
    if pct_pairs:
        logger.info(f"Layout extraction found {len(pct_pairs.splitlines())} percentage pairs")

    return parse_syllabus_with_claude(raw_text, pct_pairs or "")


DEFAULT_SYLLABUS_RESULT = {
    "course_name": "",
    "course_code": "",
    "instructor": "Staff",
    "credit_hours": 3,
    "grading_scale": {"A": 90, "B": 80, "C": 70, "D": 60},
    "categories": [
        {"name": "Exams", "weight": 60, "count": 3},
        {"name": "Homework", "weight": 30, "count": 10},
        {"name": "Other", "weight": 10, "count": 1},
    ],
    "parsing_confidence": "low",
    "warnings": [],
}


async def safe_parse_syllabus_pdf(pdf_bytes: bytes) -> tuple[dict, bool]:
    """
    Same as parse_syllabus_pdf but NEVER raises.
    Returns (result_dict, is_partial) where is_partial=True means parsing failed.
    On failure, tries to extract at least the course name/code from raw PDF text.
    """
    try:
        result = await parse_syllabus_pdf(pdf_bytes)
        return result, False
    except Exception as e:
        logger.warning(f"Syllabus parsing failed, returning defaults: {e}")

    # Attempt basic info extraction from raw text
    partial = dict(DEFAULT_SYLLABUS_RESULT)
    try:
        raw_text = extract_text_from_pdf(pdf_bytes)
        if raw_text:
            code_match = re.search(r'\b([A-Z]{2,4})\s*(\d{3,5})\b', raw_text)
            if code_match:
                partial["course_code"] = code_match.group(1) + code_match.group(2)
                partial["course_name"] = code_match.group(1) + " " + code_match.group(2)
    except Exception:
        pass

    return partial, True
