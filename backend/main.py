"""
BoilerGPA Backend — FastAPI Application
Purdue University GPA prediction tool powered by Claude AI.
"""

import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import db as database
from calculator import calculate_overall_gpa, what_score_needed
from parser import parse_syllabus_pdf, safe_parse_syllabus_pdf
from predictor import predict_overall_gpa

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("boilergpa")

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
load_dotenv()


# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 BoilerGPA starting up...")
    database.init_db()
    stats = database.get_submission_stats()
    logger.info(
        f"✅ DB ready — {stats['scraped_courses']} courses, "
        f"{stats['grade_submissions']} grade submissions"
    )
    yield
    logger.info("Shutting down BoilerGPA")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="BoilerGPA API",
    description="Purdue University GPA prediction powered by Gemini AI + crowdsourced grade data",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ClassStats(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    stdDev: Optional[float] = None


class CategoryInput(BaseModel):
    name: str
    weight: float
    score: Optional[float] = None
    completed: bool = True
    count: Optional[int] = 1
    classStats: Optional[list[Optional[ClassStats]]] = None


class CourseInput(BaseModel):
    course_name: str
    course_code: str = ""
    instructor: str = "Staff"
    semester: str = ""
    credit_hours: int = 3
    grading_scale: dict = Field(default_factory=lambda: {"A": 90, "B": 80, "C": 70, "D": 60})
    categories: list[CategoryInput] = Field(default_factory=list)


class GPARequest(BaseModel):
    courses: list[CourseInput]


class FinalScoreNeededRequest(BaseModel):
    course_name: str
    current_score: float
    completed_weight: float
    final_weight: float


class GradeSubmissionEntry(BaseModel):
    """One anonymous grade submission for a single course."""
    subject: str
    number: str
    instructor: str = ""
    semester: str = ""
    letter: str  # A / B / C / D / F


class GradeSubmissionRequest(BaseModel):
    entries: list[GradeSubmissionEntry]


class ExplainCurveRequest(BaseModel):
    course_name: str
    course_code: str = ""
    current_score: float
    current_letter: str
    predicted_score: float
    predicted_letter: str
    curve_applied: float
    confidence: str
    data_source: str  # "class_stats" | "historical" | "none"


class CommunityTemplateSubmit(BaseModel):
    course_code: str
    course_name: str = ""
    semester: str = ""
    instructor: str = ""
    categories: list[dict]
    credit_hours: int = 3
    grading_scale: dict = Field(default_factory=lambda: {"A": 90, "B": 80, "C": 70, "D": 60})


class ClassStatsItem(BaseModel):
    category_name: str
    item_index: int = 0
    mean: Optional[float] = None
    median: Optional[float] = None
    std_dev: Optional[float] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None

class ClassStatsReport(BaseModel):
    course_code: str
    semester: str = ""
    items: list[ClassStatsItem]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    stats = database.get_submission_stats()
    return {
        "status": "ok",
        **stats,
    }


@app.post("/parse-syllabus")
async def parse_syllabus(file: UploadFile = File(...)):
    """
    Accept a PDF syllabus upload, extract text with PyMuPDF,
    send to Gemini, and return structured grading data.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF file too large (max 20MB)")

    result, is_partial = await safe_parse_syllabus_pdf(pdf_bytes)

    # Save structural info as a canonical template for this course (only when fully parsed)
    if not is_partial:
        course_code = result.get("course_code", "")
        code_match = re.match(r"^([A-Za-z]+)(\d+)", course_code.strip())
        if code_match and result.get("categories"):
            subj, num = code_match.group(1).upper(), code_match.group(2)
            template_cats = [
                {k: v for k, v in cat.items() if k in ("name", "weight", "count")}
                for cat in result["categories"]
            ]
            try:
                database.upsert_course_template(
                    subject=subj,
                    number=num,
                    categories=template_cats,
                    credit_hours=result.get("credit_hours", 3),
                    grading_scale=result.get("grading_scale", {"A": 90, "B": 80, "C": 70, "D": 60}),
                )
                logger.info(f"Saved/updated course template for {subj}{num}")
            except Exception:
                logger.warning("Failed to save course template", exc_info=True)

    return {"success": True, "data": result, "partial": is_partial}


@app.post("/calculate-gpa")
async def calculate_gpa(request: GPARequest):
    """Calculate current GPA from entered scores."""
    if not request.courses:
        raise HTTPException(status_code=400, detail="At least one course is required")

    courses_data = [course.model_dump() for course in request.courses]
    result = calculate_overall_gpa(courses_data)
    return {"success": True, "data": result}


@app.post("/predict-gpa")
async def predict_gpa(request: GPARequest):
    """
    Predict final GPA using crowdsourced grade distribution data.
    Returns predicted GPA, per-course predictions, confidence levels, and curve explanations.
    """
    if not request.courses:
        raise HTTPException(status_code=400, detail="At least one course is required")

    courses_data = [course.model_dump() for course in request.courses]
    result = await predict_overall_gpa(courses_data)
    return {"success": True, "data": result}


@app.get("/courses/semesters")
async def list_semesters():
    """List all scraped semesters and their course counts."""
    return {"success": True, "data": database.list_scraped_semesters()}


@app.delete("/courses/semester/{semester}")
async def delete_semester(semester: str):
    """Delete all scraped courses for a semester (e.g. 'Spring 2026')."""
    deleted = database.delete_semester(semester)
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"No courses found for semester '{semester}'")
    return {"success": True, "deleted": deleted, "semester": semester}


@app.get("/courses/search")
async def search_courses(q: str = Query(..., min_length=2, description="Search query")):
    """
    Search Purdue courses from the local SQLite cache.
    Falls back to Purdue's public OData API if the local DB has no data yet.
    """
    local_results = database.search_courses(q)
    if local_results:
        formatted = [
            {
                "Subject": r["subject"],
                "Number": r["number"],
                "Title": r["title"],
                "CreditHours": r["credits_min"],
                "Instructors": r.get("instructors", []),
            }
            for r in local_results
        ]
        return {"success": True, "data": formatted, "source": "local"}

    # Fallback: live Purdue API (useful before the scraper has been run)
    try:
        import httpx

        PURDUE_API_BASE = "https://api.purdue.io/odata"
        q_clean = q.strip().upper().replace(" ", "")

        code_match = re.match(r"^([A-Z]+)(\d+)$", q_clean)
        if code_match:
            subj, num = code_match.groups()
            filter_str = f"startswith(Number, '{num}') and Subject eq '{subj}'"
        elif re.match(r"^[A-Z]+$", q_clean):
            filter_str = f"Subject eq '{q_clean}'"
        else:
            filter_str = f"contains(Title, '{q.strip()}')"

        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                f"{PURDUE_API_BASE}/Courses",
                params={
                    "$filter": filter_str,
                    "$select": "Subject,Number,Title,CreditHours",
                    "$top": "20",
                },
            )
            resp.raise_for_status()
            courses = resp.json().get("value", [])

        formatted = [
            {
                "Subject": c.get("Subject", ""),
                "Number": c.get("Number", ""),
                "Title": c.get("Title", ""),
                "CreditHours": c.get("CreditHours", 3),
                "Instructors": [],
            }
            for c in courses[:20]
        ]
        return {"success": True, "data": formatted, "source": "purdue_api"}
    except Exception as e:
        logger.warning(f"Purdue API fallback failed: {e}")
        return {"success": True, "data": [], "source": "none"}


@app.post("/submit-grades")
async def submit_grades(request: GradeSubmissionRequest):
    """
    Accept anonymous grade submissions from users.

    Only stores: subject, course number, instructor, semester, and final letter grade.
    Never stores individual assignment scores or any personal identifiers.
    These aggregate submissions are used to build per-course grade distributions
    for future curve predictions.
    """
    if not request.entries:
        raise HTTPException(status_code=400, detail="No entries provided")

    valid_letters = {"A", "B", "C", "D", "F"}
    entries = []
    for e in request.entries:
        letter = e.letter.upper()
        if letter not in valid_letters:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid letter grade '{e.letter}' — must be A, B, C, D, or F",
            )
        # Parse course_code like "CS25200" into subject + number if needed
        subject = e.subject.strip().upper()
        number = e.number.strip()

        entries.append({
            "subject": subject,
            "number": number,
            "instructor": e.instructor,
            "semester": e.semester,
            "letter": letter,
        })

    database.submit_grades(entries)
    logger.info(f"Received {len(entries)} anonymous grade submission(s)")
    return {"success": True, "submitted": len(entries)}


@app.get("/courses/{subject}/{number}/template")
async def get_course_template(subject: str, number: str):
    """
    Return the canonical grading template for a course (built from community syllabus uploads).
    Returns null data if no template exists yet.
    """
    template = database.get_course_template(subject.upper(), number)
    return {"success": True, "data": template}


@app.post("/what-score-needed")
async def what_score_needed_endpoint(request: FinalScoreNeededRequest):
    """Calculate what score is needed on a final to hit each letter grade threshold."""
    targets = {"A": 90.0, "B": 80.0, "C": 70.0, "D": 60.0}
    results = {}
    for grade, target_pct in targets.items():
        needed = what_score_needed(
            current_score=request.current_score,
            current_weight_completed=request.completed_weight,
            final_weight=request.final_weight,
            target_percentage=target_pct,
        )
        results[grade] = needed

    return {
        "success": True,
        "data": {
            "course_name": request.course_name,
            "scores_needed": results,
        },
    }


@app.post("/explain-curve")
async def explain_curve(request: ExplainCurveRequest):
    """
    Generate a concise, student-facing AI explanation for the curve prediction.
    Uses Claude Haiku — fast and cheap (< $0.001 per call).
    """
    import anthropic as _anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    source_context = {
        "class_stats": "professor-released class statistics (mean/std dev entered by the student)",
        "historical": "historical grade submissions from past students of this course",
        "none": "no historical data — only the student's raw score is available",
    }.get(request.data_source, "available data")

    no_curve = request.curve_applied == 0

    prompt = f"""You are explaining a GPA curve prediction to a college student.

Course: {request.course_name or request.course_code}
Student's current score: {request.current_score:.1f}%
Current letter grade (raw): {request.current_letter}
Predicted score after curve: {request.predicted_score:.1f}%
Predicted letter grade: {request.predicted_letter}
Curve applied: {request.curve_applied} points
Data source: {source_context}
Confidence: {request.confidence}

Write 2-3 sentences directly to the student explaining {"why no curve is expected" if no_curve else f"why their {request.current_score:.1f}% is predicted to be curved to a {request.predicted_letter}"}. Be specific about the numbers. Be honest about uncertainty if confidence is low or medium. Don't use bullet points. Don't start with "I"."""

    client = _anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    explanation = response.content[0].text.strip()

    return {"success": True, "explanation": explanation}


# ---------------------------------------------------------------------------
# Community templates
# ---------------------------------------------------------------------------

@app.post("/community/submit")
async def submit_community_template(req: CommunityTemplateSubmit):
    """Publish a grading structure (no scores) to the community DB."""
    m = re.match(r"^([A-Za-z]+)(\d+)", req.course_code.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Invalid course code")
    subject, number = m.group(1).upper(), m.group(2)

    # Strip everything except structural fields — never store scores
    clean_cats = [
        {"name": c.get("name", ""), "weight": c.get("weight", 0), "count": c.get("count", 1)}
        for c in req.categories
        if c.get("name", "").strip()
    ]
    if not clean_cats:
        raise HTTPException(status_code=400, detail="No valid categories")

    template_id = database.submit_community_template(
        subject=subject,
        number=number,
        course_name=req.course_name,
        semester=req.semester,
        instructor=req.instructor,
        categories=clean_cats,
        credit_hours=req.credit_hours,
        grading_scale=req.grading_scale,
    )
    return {"success": True, "template_id": template_id}


@app.get("/community/templates/{course_code}")
async def get_community_templates(course_code: str):
    """Return all community templates for a course code, sorted by stars."""
    m = re.match(r"^([A-Za-z]+)(\d+)", course_code.strip())
    if not m:
        return {"success": True, "templates": []}
    subject, number = m.group(1).upper(), m.group(2)
    templates = database.get_community_templates(subject, number)
    return {"success": True, "templates": templates}


@app.post("/community/star/{template_id}")
async def star_community_template(template_id: int):
    """Upvote a community template."""
    stars = database.star_community_template(template_id)
    if stars is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True, "stars": stars}


@app.post("/class-stats/report")
async def report_class_stats(req: ClassStatsReport):
    """Submit crowd-sourced class statistics for a course."""
    if not req.course_code.strip():
        raise HTTPException(status_code=400, detail="course_code required")
    for item in req.items:
        database.report_class_stats(
            course_code=req.course_code,
            category_name=item.category_name,
            item_index=item.item_index,
            semester=req.semester,
            mean=item.mean,
            median=item.median,
            std_dev=item.std_dev,
            min_score=item.min_score,
            max_score=item.max_score,
        )
    return {"success": True}


@app.get("/class-stats/{course_code}")
async def get_class_stats(course_code: str, semester: str = ""):
    """Return aggregated community class stats for a course."""
    stats = database.get_class_stats_for_course(course_code.strip(), semester)
    return {"success": True, "stats": stats}
