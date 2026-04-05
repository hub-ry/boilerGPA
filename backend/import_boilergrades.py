"""
Import BoilerGrades CSV data into the local SQLite historical_grade_stats table.

Source: https://github.com/eduxstad/boiler-grades (GPL v3)
Data: Purdue grade distributions obtained via public records request.

Usage:
    python import_boilergrades.py           # downloads and imports all semesters
    python import_boilergrades.py --dry-run # parse only, no DB writes
"""

import argparse
import csv
import io
import logging
from collections import defaultdict

import httpx

import db as database

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("importer")

SEMESTER_FILES = [
    ("fall2021.csv",   "Fall",   2021, "standard_comma"),
    ("fall2023.csv",   "Fall",   2023, "fall2023"),
    ("summer2023.csv", "Summer", 2023, "standard_semi"),
    ("spring2024.csv", "Spring", 2024, "standard_semi"),
    ("fall2024.csv",   "Fall",   2024, "standard_semi"),
    ("spring2025.csv", "Spring", 2025, "standard_semi"),
]

BASE_URL = "https://raw.githubusercontent.com/eduxstad/boiler-grades/main/"


def _pct(val: str) -> float:
    """Parse '19.6%' → 19.6, '' → 0.0."""
    v = val.strip().rstrip("%")
    try:
        return float(v) if v else 0.0
    except ValueError:
        return 0.0


def _last_name(full: str) -> str:
    """'Marais, Karen' → 'Marais'. Handles blank/Staff."""
    name = full.strip()
    if not name or name.lower() in ("staff", "tba", ""):
        return "Staff"
    return name.split(",")[0].strip()


def parse_csv_fall2023(content: str) -> list[dict]:
    """
    fall2023.csv has no header and a unique layout:
      Semester;Subject;CourseNumber;Title;Instructor;A%;B%;C%;D%;F%;W%;?

    Values are already aggregated A/B/C/D/F (no plus/minus) and already percentages.
    """
    acc: dict[tuple, list[dict]] = defaultdict(list)

    for line in content.splitlines():
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 6:
            continue
        # parts[0] = "Fall 2023", parts[1] = subject, parts[2] = number,
        # parts[3] = title, parts[4] = instructor, parts[5..] = grade pcts
        subject    = parts[1].strip().upper()
        number     = parts[2].strip()
        instructor = _last_name(parts[4])

        if not subject or not number:
            continue

        grade_vals = [_pct(p) for p in parts[5:]]
        # Columns after instructor: A, B, C, D, F, W (order confirmed from data)
        if len(grade_vals) < 5:
            continue

        a_pct, b_pct, c_pct, d_pct, f_pct = grade_vals[:5]
        graded = a_pct + b_pct + c_pct + d_pct + f_pct
        if graded < 1.0:
            continue

        acc[(subject, number, instructor)].append(
            {"a": a_pct, "b": b_pct, "c": c_pct, "d": d_pct, "f": f_pct}
        )

    rows = []
    for (subject, number, instructor), sections in acc.items():
        n = len(sections)
        rows.append({
            "subject": subject, "number": number, "instructor": instructor,
            "semester": "Fall", "year": 2023,
            "a_count": round(sum(s["a"] for s in sections) / n, 2),
            "b_count": round(sum(s["b"] for s in sections) / n, 2),
            "c_count": round(sum(s["c"] for s in sections) / n, 2),
            "d_count": round(sum(s["d"] for s in sections) / n, 2),
            "f_count": round(sum(s["f"] for s in sections) / n, 2),
            "total":   100,
        })
    return rows


def parse_csv(content: str, semester: str, year: int, delimiter: str = ";") -> list[dict]:
    """
    Parse one semester CSV.

    Returns a list of dicts: {subject, number, instructor, semester, year,
                               a_count, b_count, c_count, d_count, f_count, total=100}

    Rows are grouped per (subject, number, instructor) — multiple sections
    of the same course+instructor are averaged together since we only have
    percentages (no section sizes to weight by).
    """
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)

    # forward-fill state
    cur_subject = ""
    cur_number = ""

    # accumulator: key → list of per-section grade buckets
    acc: dict[tuple, list[dict]] = defaultdict(list)

    for row in reader:
        subject = row.get("Subject", "").strip() or cur_subject
        number  = row.get("Course Number", "").strip() or cur_number

        if not subject or not number:
            continue

        cur_subject = subject
        cur_number  = number

        instructor = _last_name(row.get("Instructor", ""))

        a_pct = _pct(row.get("A+", "")) + _pct(row.get("A", "")) + _pct(row.get("A-", ""))
        b_pct = _pct(row.get("B+", "")) + _pct(row.get("B", "")) + _pct(row.get("B-", ""))
        c_pct = _pct(row.get("C+", "")) + _pct(row.get("C", "")) + _pct(row.get("C-", ""))
        d_pct = _pct(row.get("D+", "")) + _pct(row.get("D", "")) + _pct(row.get("D-", ""))
        # E = old Purdue failing grade, F = standard fail, WF = withdraw failing
        f_pct = _pct(row.get("E", "")) + _pct(row.get("F", "")) + _pct(row.get("WF", ""))

        graded = a_pct + b_pct + c_pct + d_pct + f_pct
        if graded < 1.0:
            # Row is all pass/fail, audit, or empty — not useful for GPA prediction
            continue

        acc[(subject.upper(), number, instructor)].append({
            "a": a_pct, "b": b_pct, "c": c_pct, "d": d_pct, "f": f_pct,
        })

    rows = []
    for (subject, number, instructor), sections in acc.items():
        n = len(sections)
        rows.append({
            "subject":   subject,
            "number":    number,
            "instructor": instructor,
            "semester":  semester,
            "year":      year,
            # Average across sections — store as pseudo-counts out of 100
            # so the existing predictor weighted-average formula works unchanged.
            "a_count": round(sum(s["a"] for s in sections) / n, 2),
            "b_count": round(sum(s["b"] for s in sections) / n, 2),
            "c_count": round(sum(s["c"] for s in sections) / n, 2),
            "d_count": round(sum(s["d"] for s in sections) / n, 2),
            "f_count": round(sum(s["f"] for s in sections) / n, 2),
            "total":   100,
        })

    return rows


def download(filename: str) -> str:
    url = BASE_URL + filename
    logger.info(f"Downloading {url}")
    resp = httpx.get(url, timeout=15)
    resp.raise_for_status()
    return resp.text


def run(dry_run: bool = False) -> None:
    database.init_db()
    database.ensure_historical_table()

    total_inserted = 0
    total_skipped = 0

    for filename, semester, year, fmt in SEMESTER_FILES:
        try:
            content = download(filename)
        except Exception as e:
            logger.warning(f"Failed to download {filename}: {e}")
            continue

        if fmt == "fall2023":
            rows = parse_csv_fall2023(content)
        elif fmt == "standard_comma":
            rows = parse_csv(content, semester, year, delimiter=",")
        else:
            rows = parse_csv(content, semester, year, delimiter=";")
        logger.info(f"{filename}: parsed {len(rows)} course-instructor records")

        if dry_run:
            for r in rows[:5]:
                logger.info(f"  DRY RUN sample: {r}")
            continue

        inserted, skipped = database.bulk_insert_historical(rows)
        total_inserted += inserted
        total_skipped += skipped
        logger.info(f"  {inserted} inserted, {skipped} already existed")

    if not dry_run:
        logger.info(f"Done. Total: {total_inserted} inserted, {total_skipped} skipped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
