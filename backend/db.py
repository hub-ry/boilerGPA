"""
SQLite database layer for BoilerGPA.

Two concerns:
  1. Purdue course catalog  — populated by scraper.py, used for fast course search.
  2. Anonymous grade submissions — crowdsourced from users, used for live curve predictions.

Schema intentionally stores only letter grades (A/B/C/D/F), not individual assignment scores.
"""

import json
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "data" / "boilergpa.db"


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Safe to call repeatedly."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS courses (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                subject     TEXT    NOT NULL,
                number      TEXT    NOT NULL,
                title       TEXT,
                description TEXT,
                credits_min INTEGER NOT NULL DEFAULT 3,
                credits_max INTEGER NOT NULL DEFAULT 3,
                semester    TEXT    NOT NULL,
                instructors TEXT    NOT NULL DEFAULT '[]',
                scraped_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                UNIQUE(subject, number, semester)
            );

            -- Anonymous grade submissions from users.
            -- We only store the final letter grade per course, never individual assignment scores.
            CREATE TABLE IF NOT EXISTS grade_submissions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                subject      TEXT NOT NULL,
                number       TEXT NOT NULL,
                instructor   TEXT NOT NULL DEFAULT '',
                semester     TEXT NOT NULL DEFAULT '',
                letter       TEXT NOT NULL CHECK(letter IN ('A','B','C','D','F')),
                submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Canonical grading structure templates, built from community syllabus uploads.
            -- Stores category names/weights/counts so every user gets the same layout for a course.
            CREATE TABLE IF NOT EXISTS course_templates (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                subject          TEXT    NOT NULL,
                number           TEXT    NOT NULL,
                categories       TEXT    NOT NULL DEFAULT '[]',
                credit_hours     INTEGER NOT NULL DEFAULT 3,
                grading_scale    TEXT    NOT NULL DEFAULT '{"A":90,"B":80,"C":70,"D":60}',
                submission_count INTEGER NOT NULL DEFAULT 1,
                updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
                UNIQUE(subject, number)
            );

            CREATE INDEX IF NOT EXISTS idx_courses_subject_number
                ON courses(subject, number);
            CREATE INDEX IF NOT EXISTS idx_courses_title
                ON courses(title COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_submissions_lookup
                ON grade_submissions(subject, number, instructor, semester);
            CREATE INDEX IF NOT EXISTS idx_templates_course
                ON course_templates(subject, number);

            -- Community-submitted grading structures (multiple per course, star-ranked)
            CREATE TABLE IF NOT EXISTS community_templates (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                subject      TEXT    NOT NULL,
                number       TEXT    NOT NULL,
                course_name  TEXT    NOT NULL DEFAULT '',
                semester     TEXT    NOT NULL DEFAULT '',
                instructor   TEXT    NOT NULL DEFAULT '',
                categories   TEXT    NOT NULL DEFAULT '[]',
                credit_hours INTEGER NOT NULL DEFAULT 3,
                grading_scale TEXT   NOT NULL DEFAULT '{"A":90,"B":80,"C":70,"D":60}',
                stars        INTEGER NOT NULL DEFAULT 0,
                submitted_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_community_templates_course
                ON community_templates(subject, number);

            -- Community-reported class statistics (crowd-sourced from students)
            CREATE TABLE IF NOT EXISTS class_stats_reports (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                course_code  TEXT    NOT NULL,
                category_name TEXT   NOT NULL,
                item_index   INTEGER NOT NULL DEFAULT 0,
                semester     TEXT    NOT NULL DEFAULT '',
                mean         REAL,
                median       REAL,
                std_dev      REAL,
                min_score    REAL,
                max_score    REAL,
                submitted_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_class_stats_course
                ON class_stats_reports(course_code, category_name);
        """)


# ---------------------------------------------------------------------------
# Course catalog
# ---------------------------------------------------------------------------

def upsert_course(
    subject: str,
    number: str,
    title: str,
    description: str,
    credits_min: int,
    credits_max: int,
    semester: str,
    instructors: list[str],
) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO courses
                (subject, number, title, description, credits_min, credits_max, semester, instructors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(subject, number, semester) DO UPDATE SET
                title       = excluded.title,
                description = excluded.description,
                credits_min = excluded.credits_min,
                credits_max = excluded.credits_max,
                instructors = excluded.instructors,
                scraped_at  = datetime('now')
            """,
            (
                subject.upper(),
                number,
                title,
                description,
                credits_min,
                credits_max,
                semester,
                json.dumps(instructors),
            ),
        )


def is_semester_scraped(semester: str) -> bool:
    with get_db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM courses WHERE semester = ?", (semester,)
        ).fetchone()
        return row["cnt"] > 0


def search_courses(query: str, limit: int = 20) -> list[dict]:
    """
    Search the local course catalog. Tries three strategies in order:
      1. Subject+number prefix  e.g. "CS252" → subject=CS, number LIKE '252%'
      2. Subject only           e.g. "CS"
      3. Title keyword          e.g. "Linear Algebra"
    Returns dicts with: subject, number, title, credits_min, credits_max, instructors
    """
    import re

    q = query.strip().upper()

    with get_db() as conn:
        code_match = re.match(r"^([A-Z]+)(\d+)$", q.replace(" ", ""))
        if code_match:
            subj, num = code_match.groups()
            rows = conn.execute(
                """
                SELECT subject, number, title, credits_min, credits_max,
                       instructors
                FROM courses
                WHERE subject = ? AND number LIKE ?
                GROUP BY subject, number
                ORDER BY number
                LIMIT ?
                """,
                (subj, f"{num}%", limit),
            ).fetchall()
        elif re.match(r"^[A-Z]+$", q):
            rows = conn.execute(
                """
                SELECT subject, number, title, credits_min, credits_max,
                       instructors
                FROM courses
                WHERE subject = ?
                GROUP BY subject, number
                ORDER BY number
                LIMIT ?
                """,
                (q, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT subject, number, title, credits_min, credits_max,
                       instructors
                FROM courses
                WHERE title LIKE ?
                GROUP BY subject, number
                ORDER BY subject, number
                LIMIT ?
                """,
                (f"%{query.strip()}%", limit),
            ).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        try:
            d["instructors"] = json.loads(d["instructors"])
        except Exception:
            d["instructors"] = []
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Grade submissions (crowdsourced)
# ---------------------------------------------------------------------------

def submit_grades(entries: list[dict]) -> None:
    """
    Bulk-insert anonymous grade submissions.
    Each entry: {subject, number, instructor, semester, letter}
    """
    with get_db() as conn:
        conn.executemany(
            """
            INSERT INTO grade_submissions (subject, number, instructor, semester, letter)
            VALUES (:subject, :number, :instructor, :semester, :letter)
            """,
            [
                {
                    "subject": e["subject"].upper(),
                    "number": e["number"],
                    "instructor": e.get("instructor", ""),
                    "semester": e.get("semester", ""),
                    "letter": e["letter"].upper(),
                }
                for e in entries
            ],
        )


def get_grade_distribution(
    subject: str,
    number: str,
    instructor: str = "",
    semester: str = "",
    min_samples: int = 5,
) -> Optional[dict]:
    """
    Return aggregate grade counts from crowdsourced submissions.

    Lookup priority:
      1. Same instructor + same semester  (most specific)
      2. Same instructor, any semester
      3. Any instructor, any semester     (course-level fallback)

    Returns None if not enough data (< min_samples).
    Result dict: {a_count, b_count, c_count, d_count, f_count, total}
    """
    subject = subject.upper()
    instructor_last = instructor.strip().split()[-1].lower() if instructor.strip() else ""

    def _query(extra_where: str, params: list) -> Optional[dict]:
        with get_db() as conn:
            row = conn.execute(
                f"""
                SELECT
                    SUM(letter = 'A') AS a_count,
                    SUM(letter = 'B') AS b_count,
                    SUM(letter = 'C') AS c_count,
                    SUM(letter = 'D') AS d_count,
                    SUM(letter = 'F') AS f_count,
                    COUNT(*)          AS total
                FROM grade_submissions
                WHERE subject = ? AND number = ?
                {extra_where}
                """,
                [subject, number] + params,
            ).fetchone()
        if row and row["total"] and row["total"] >= min_samples:
            return dict(row)
        return None

    if instructor_last and instructor_last not in ("staff", "tba"):
        # 1. instructor + semester
        if semester:
            result = _query(
                "AND LOWER(instructor) LIKE ? AND semester = ?",
                [f"%{instructor_last}%", semester],
            )
            if result:
                return result
        # 2. instructor only
        result = _query("AND LOWER(instructor) LIKE ?", [f"%{instructor_last}%"])
        if result:
            return result

    # 3. course-level fallback
    return _query("", [])


# ---------------------------------------------------------------------------
# Course templates (canonical grading structure)
# ---------------------------------------------------------------------------

def get_course_template(subject: str, number: str) -> Optional[dict]:
    """
    Return the canonical grading template for a course, or None if not found.
    Result: { categories, credit_hours, grading_scale, submission_count }
    """
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT categories, credit_hours, grading_scale, submission_count
            FROM course_templates
            WHERE subject = ? AND number = ?
            """,
            (subject.upper(), number),
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    try:
        d["categories"] = json.loads(d["categories"])
    except Exception:
        d["categories"] = []
    try:
        d["grading_scale"] = json.loads(d["grading_scale"])
    except Exception:
        d["grading_scale"] = {"A": 90, "B": 80, "C": 70, "D": 60}
    return d


def upsert_course_template(
    subject: str,
    number: str,
    categories: list,
    credit_hours: int,
    grading_scale: dict,
) -> None:
    """
    Save or update a canonical course grading template.
    Categories should contain only structural fields: name, weight, count.
    """
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO course_templates
                (subject, number, categories, credit_hours, grading_scale, submission_count)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(subject, number) DO UPDATE SET
                categories       = excluded.categories,
                credit_hours     = excluded.credit_hours,
                grading_scale    = excluded.grading_scale,
                submission_count = submission_count + 1,
                updated_at       = datetime('now')
            """,
            (
                subject.upper(),
                number,
                json.dumps(categories),
                credit_hours,
                json.dumps(grading_scale),
            ),
        )


# ---------------------------------------------------------------------------
# Community templates (user-submitted grading structures)
# ---------------------------------------------------------------------------

def submit_community_template(
    subject: str,
    number: str,
    course_name: str,
    semester: str,
    instructor: str,
    categories: list,
    credit_hours: int,
    grading_scale: dict,
) -> int:
    """
    Insert a new community template. If an identical category structure already
    exists for the same course+semester, star it instead of duplicating.
    Returns the template id.
    """
    subject = subject.upper()
    cat_names_key = json.dumps(sorted(c.get("name", "") for c in categories))

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, categories FROM community_templates WHERE subject = ? AND number = ? AND semester = ?",
            (subject, number, semester),
        ).fetchall()

        for row in existing:
            try:
                ec = json.loads(row["categories"])
                if json.dumps(sorted(c.get("name", "") for c in ec)) == cat_names_key:
                    conn.execute(
                        "UPDATE community_templates SET stars = stars + 1 WHERE id = ?",
                        (row["id"],),
                    )
                    return row["id"]
            except Exception:
                pass

        cur = conn.execute(
            """
            INSERT INTO community_templates
                (subject, number, course_name, semester, instructor, categories, credit_hours, grading_scale, stars)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                subject, number, course_name, semester, instructor,
                json.dumps(categories), credit_hours, json.dumps(grading_scale),
            ),
        )
        return cur.lastrowid


def get_community_templates(subject: str, number: str) -> list[dict]:
    """Return all community templates for a course, sorted by stars desc."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, subject, number, course_name, semester, instructor,
                   categories, credit_hours, grading_scale, stars, submitted_at
            FROM community_templates
            WHERE subject = ? AND number = ?
            ORDER BY stars DESC, submitted_at DESC
            """,
            (subject.upper(), number),
        ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        try:
            d["categories"] = json.loads(d["categories"])
        except Exception:
            d["categories"] = []
        try:
            d["grading_scale"] = json.loads(d["grading_scale"])
        except Exception:
            d["grading_scale"] = {"A": 90, "B": 80, "C": 70, "D": 60}
        result.append(d)
    return result


def star_community_template(template_id: int) -> Optional[int]:
    """Upvote a template. Returns new star count, or None if not found."""
    with get_db() as conn:
        conn.execute(
            "UPDATE community_templates SET stars = stars + 1 WHERE id = ?",
            (template_id,),
        )
        row = conn.execute(
            "SELECT stars FROM community_templates WHERE id = ?", (template_id,)
        ).fetchone()
    return row["stars"] if row else None


def report_class_stats(
    course_code: str,
    category_name: str,
    item_index: int,
    semester: str,
    mean: Optional[float],
    median: Optional[float],
    std_dev: Optional[float],
    min_score: Optional[float],
    max_score: Optional[float],
) -> None:
    """Record a student's report of class statistics for a specific exam/assignment."""
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO class_stats_reports
                (course_code, category_name, item_index, semester, mean, median, std_dev, min_score, max_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (course_code.upper(), category_name, item_index, semester, mean, median, std_dev, min_score, max_score),
        )


def get_class_stats_for_course(course_code: str, semester: str = "") -> dict:
    """
    Return aggregated community class stats for all categories of a course.
    Groups by category_name + item_index, averages reported values.
    Result: { category_name: [ {mean, median, std_dev, min_score, max_score, report_count}, ... ] }
    Ordered by item_index within each category.
    """
    code = course_code.upper()
    with get_db() as conn:
        if semester:
            rows = conn.execute(
                """
                SELECT category_name, item_index,
                       AVG(mean) AS mean, AVG(median) AS median,
                       AVG(std_dev) AS std_dev, AVG(min_score) AS min_score,
                       AVG(max_score) AS max_score, COUNT(*) AS report_count
                FROM class_stats_reports
                WHERE course_code = ? AND semester = ?
                GROUP BY category_name, item_index
                ORDER BY category_name, item_index
                """,
                (code, semester),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT category_name, item_index,
                       AVG(mean) AS mean, AVG(median) AS median,
                       AVG(std_dev) AS std_dev, AVG(min_score) AS min_score,
                       AVG(max_score) AS max_score, COUNT(*) AS report_count
                FROM class_stats_reports
                WHERE course_code = ?
                GROUP BY category_name, item_index
                ORDER BY category_name, item_index
                """,
                (code,),
            ).fetchall()

    result: dict = {}
    for row in rows:
        d = dict(row)
        cat = d.pop("category_name")
        d.pop("item_index")
        if cat not in result:
            result[cat] = []
        result[cat].append(d)
    return result


def delete_semester(semester: str) -> int:
    """Delete all scraped courses for a semester. Returns number of rows deleted."""
    with get_db() as conn:
        cur = conn.execute("DELETE FROM courses WHERE semester = ?", (semester,))
        return cur.rowcount


def list_scraped_semesters() -> list[dict]:
    """Return all semesters in the courses table with their course counts."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT semester, COUNT(*) AS count FROM courses GROUP BY semester ORDER BY semester"
        ).fetchall()
    return [dict(r) for r in rows]


def get_submission_stats() -> dict:
    """Quick stats for the /health endpoint."""
    with get_db() as conn:
        courses_count = conn.execute("SELECT COUNT(*) AS cnt FROM courses").fetchone()["cnt"]
        submissions_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM grade_submissions"
        ).fetchone()["cnt"]
    return {"scraped_courses": courses_count, "grade_submissions": submissions_count}
