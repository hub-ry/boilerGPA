"""
GPA prediction logic for BoilerGPA.

Priority order for curve estimation:
  1. Current-semester class stats (mean/std dev released by professor) — most accurate
  2. Crowdsourced grade distributions from SQLite — historical baseline
  3. Nothing — conservative fallback (small or no curve, low confidence)
"""

import logging
import re
from typing import Optional

import db as database

logger = logging.getLogger(__name__)


def _parse_course_code(course_code: str) -> tuple[str, str]:
    match = re.match(r"^([A-Za-z]+)(\d+)", course_code.strip())
    if match:
        return match.group(1).upper(), match.group(2)
    return "", ""


# ---------------------------------------------------------------------------
# Historical record helpers (crowdsourced SQLite data)
# ---------------------------------------------------------------------------

def compute_historical_avg_pct(record: dict) -> float:
    """Estimate average raw percentage from a grade distribution record."""
    a = float(record.get("a_count", 0) or 0)
    b = float(record.get("b_count", 0) or 0)
    c = float(record.get("c_count", 0) or 0)
    d = float(record.get("d_count", 0) or 0)
    f = float(record.get("f_count", 0) or 0)
    total = a + b + c + d + f
    if total == 0:
        return 75.0
    return (a * 95 + b * 85 + c * 75 + d * 65 + f * 50) / total


# ---------------------------------------------------------------------------
# Curve inference
# ---------------------------------------------------------------------------

def _curve_from_mean(class_mean_pct: float, grading_scale: dict, conservative: bool = False) -> float:
    """
    Estimate a curve given a class mean percentage.

    Logic: if the mean is below the B threshold, the class will likely get
    curved. We apply a partial correction so the mean lands at/near the B line.

    conservative=True (historical data, no current stats): use smaller multipliers.
    """
    b_min = grading_scale.get("B", 80)

    gap = b_min - class_mean_pct  # positive = mean is below B
    if gap <= 0:
        return 0.0  # mean is already at B or above — no curve needed

    if conservative:
        # Historical data only — be cautious, don't over-promise
        if gap > 5:
            return round(min(gap * 0.4, 10.0), 1)
        return round(gap * 0.25, 1)
    else:
        # Current-semester stats from professor — trust them more
        if gap > 5:
            return round(min(gap * 0.6, 15.0), 1)
        return round(gap * 0.4, 1)


def infer_curve_from_class_stats(categories: list[dict], grading_scale: dict) -> tuple[float, str]:
    """
    Derive a weighted course-level curve from per-category class stats.

    classStats is an array — one entry per assignment (e.g. 3 entries for 3 midterms).
    Each entry is either None or { min, max, mean, median, stdDev }.
    Only entries with a valid mean contribute.

    Returns (curve_pts, explanation).
    """
    total_weight = 0.0
    weighted_curve = 0.0
    parts = []

    for cat in categories:
        stats_arr = cat.get("classStats") or []
        if not isinstance(stats_arr, list):
            stats_arr = [stats_arr] if stats_arr else []

        weight = float(cat.get("weight", 0))
        if weight <= 0:
            continue

        count = cat.get("count") or len(stats_arr) or 1
        cat_name = (cat.get("name") or "category").rstrip("s")  # "Exams" → "Exam"

        # Each assignment within the category is worth weight/count of the total grade
        per_item_weight = weight / count

        for idx, stats in enumerate(stats_arr):
            if not stats:
                continue
            mean = stats.get("mean")
            if mean is None:
                continue

            mean_pct = float(mean)
            curve = _curve_from_mean(mean_pct, grading_scale, conservative=False)
            label = f"{cat_name} {idx + 1}" if count > 1 else cat_name

            if curve > 0.5:
                parts.append(f"{label}: mean {mean_pct:.1f}% → +{curve:.1f} pt curve")
            else:
                parts.append(f"{label}: mean {mean_pct:.1f}% → no significant curve")

            weighted_curve += curve * (per_item_weight / 100.0)
            total_weight += per_item_weight

    if total_weight == 0:
        return 0.0, ""

    final_curve = round(weighted_curve, 1)
    explanation = "; ".join(parts)
    return final_curve, explanation


# ---------------------------------------------------------------------------
# Per-course prediction
# ---------------------------------------------------------------------------

async def predict_course_grade(course: dict, current_score: float) -> dict:
    """
    Predict the final grade for a single course.

    Tries three data sources in priority order:
      1. Class stats on individual categories (current semester, highest confidence)
      2. Crowdsourced grade distributions from SQLite
      3. Conservative fallback (no curve, low confidence)
    """
    from calculator import letter_to_gpa, percentage_to_letter

    course_code = course.get("course_code", "")
    instructor = course.get("instructor", "")
    semester = course.get("semester", "")
    grading_scale = course.get("grading_scale", {"A": 90, "B": 80, "C": 70, "D": 60})
    categories = course.get("categories", [])

    # ── Path 1: current-semester class stats ──────────────────────────────
    stats_curve, stats_explanation = infer_curve_from_class_stats(categories, grading_scale)
    def _any_mean(cat):
        arr = cat.get("classStats") or []
        if not isinstance(arr, list):
            arr = [arr]
        return any(
            isinstance(s, dict) and s.get("mean") is not None
            for s in arr
        )
    has_current_stats = stats_curve > 0 or any(_any_mean(cat) for cat in categories)

    if has_current_stats:
        curve = stats_curve
        confidence = "high"
        explanation = (
            f"Curve estimated from professor-released class statistics. {stats_explanation}"
        ).strip()

        predicted_score = min(100.0, current_score + curve)
        predicted_letter = percentage_to_letter(predicted_score, grading_scale)
        predicted_gpa = letter_to_gpa(predicted_letter)

        return {
            "predicted_score": round(predicted_score, 2),
            "predicted_letter": predicted_letter,
            "predicted_gpa": predicted_gpa,
            "curve_applied": curve,
            "confidence": confidence,
            "explanation": explanation,
            "data_source": "class_stats",
        }

    # ── Path 1b: community-reported class stats from DB ───────────────────
    if not has_current_stats and course_code:
        community_stats = database.get_class_stats_for_course(course_code, semester)
        if community_stats:
            # Build fake classStats on categories for reuse of existing logic
            merged_cats = []
            for cat in categories:
                cat_name = cat.get("name", "")
                if cat_name in community_stats:
                    items = community_stats[cat_name]
                    fake_stats = [
                        {"mean": item.get("mean"), "median": item.get("median"),
                         "stdDev": item.get("std_dev"), "min": item.get("min_score"),
                         "max": item.get("max_score")}
                        for item in items
                    ]
                    merged_cats.append({**cat, "classStats": fake_stats})
                else:
                    merged_cats.append(cat)

            community_curve, community_explanation = infer_curve_from_class_stats(merged_cats, grading_scale)
            has_community_stats = community_curve > 0 or any(
                isinstance(s, dict) and s.get("mean") is not None
                for cat in merged_cats
                for s in (cat.get("classStats") or [])
                if isinstance(s, dict)
            )
            if has_community_stats:
                predicted_score = min(100.0, current_score + community_curve)
                predicted_letter = percentage_to_letter(predicted_score, grading_scale)
                predicted_gpa = letter_to_gpa(predicted_letter)
                return {
                    "predicted_score": round(predicted_score, 2),
                    "predicted_letter": predicted_letter,
                    "predicted_gpa": predicted_gpa,
                    "curve_applied": community_curve,
                    "confidence": "high",
                    "explanation": f"Curve estimated from community-reported class statistics. {community_explanation}".strip(),
                    "data_source": "class_stats",
                }

    # ── Path 2: crowdsourced historical data ─────────────────────────────
    subject, number = _parse_course_code(course_code)
    record = None
    if subject and number:
        record = database.get_grade_distribution(
            subject=subject,
            number=number,
            instructor=instructor,
            semester=semester,
        )

    if record:
        historical_avg = compute_historical_avg_pct(record)
        total_students = int(record.get("total", 0) or 0)
        curve = _curve_from_mean(historical_avg, grading_scale, conservative=True)

        if total_students >= 100:
            confidence = "medium"
        elif total_students >= 30:
            confidence = "medium"
        else:
            confidence = "low"

        instructor_label = (
            instructor if instructor and instructor.lower() not in ("", "staff", "tba")
            else "historical submissions"
        )

        if curve > 0.5:
            explanation = (
                f"Based on {total_students} past grade submissions for {course_code} under {instructor_label}. "
                f"Historical class avg ~{historical_avg:.0f}% → estimated +{curve:.1f} pt curve. "
                "No current-semester stats yet — add them with the σ button for a better prediction."
            )
        else:
            explanation = (
                f"Based on {total_students} past grade submissions for {course_code}. "
                f"Historical avg ~{historical_avg:.0f}% — no significant curve expected. "
                "Add class stats with the σ button for a more accurate prediction."
            )

        predicted_score = min(100.0, current_score + curve)
        predicted_letter = percentage_to_letter(predicted_score, grading_scale)
        predicted_gpa = letter_to_gpa(predicted_letter)

        return {
            "predicted_score": round(predicted_score, 2),
            "predicted_letter": predicted_letter,
            "predicted_gpa": predicted_gpa,
            "curve_applied": curve,
            "confidence": confidence,
            "explanation": explanation,
            "data_source": "historical",
        }

    # ── Path 3: conservative fallback ────────────────────────────────────
    predicted_letter = percentage_to_letter(current_score, grading_scale)
    predicted_gpa = letter_to_gpa(predicted_letter)

    return {
        "predicted_score": round(current_score, 2),
        "predicted_letter": predicted_letter,
        "predicted_gpa": predicted_gpa,
        "curve_applied": 0.0,
        "confidence": "low",
        "explanation": (
            f"No historical data or class statistics available for {course_code}. "
            "Prediction is your raw score only. "
            "Use the σ button on each exam category to enter class stats for a better estimate."
        ),
        "data_source": "none",
    }


# ---------------------------------------------------------------------------
# Overall semester prediction
# ---------------------------------------------------------------------------

async def predict_overall_gpa(courses: list[dict]) -> dict:
    from calculator import (
        calculate_course_grade,
        letter_to_gpa,
        percentage_to_letter,
    )

    total_quality_points = 0.0
    total_credit_hours = 0
    course_predictions = []

    for course in courses:
        credit_hours = int(course.get("credit_hours", 3))
        categories = course.get("categories", [])
        grading_scale = course.get("grading_scale", {"A": 90, "B": 80, "C": 70, "D": 60})

        grade_info = calculate_course_grade(categories)
        current_score = grade_info["weighted_score"]

        prediction = await predict_course_grade(course, current_score)

        total_quality_points += prediction["predicted_gpa"] * credit_hours
        total_credit_hours += credit_hours

        course_predictions.append({
            "course_name": course.get("course_name", "Unknown"),
            "course_code": course.get("course_code", ""),
            "instructor": course.get("instructor", ""),
            "credit_hours": credit_hours,
            "current_score": current_score,
            "current_letter": percentage_to_letter(current_score, grading_scale),
            "current_gpa": letter_to_gpa(percentage_to_letter(current_score, grading_scale)),
            **prediction,
        })

    predicted_gpa = (
        round(total_quality_points / total_credit_hours, 2)
        if total_credit_hours > 0
        else 0.0
    )

    return {
        "predicted_gpa": predicted_gpa,
        "total_credit_hours": total_credit_hours,
        "courses": course_predictions,
    }
