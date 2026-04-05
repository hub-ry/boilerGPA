"""
GPA calculation logic for BoilerGPA.
Handles weighted average computation, letter grade conversion, and GPA point mapping.
"""

from typing import Optional

# Standard Purdue-style GPA scale
GPA_SCALE = {
    "A+": 4.0,
    "A":  4.0,
    "A-": 3.7,
    "B+": 3.3,
    "B":  3.0,
    "B-": 2.7,
    "C+": 2.3,
    "C":  2.0,
    "C-": 1.7,
    "D+": 1.3,
    "D":  1.0,
    "D-": 0.7,
    "F":  0.0,
}

DEFAULT_GRADING_SCALE = {"A": 90, "B": 80, "C": 70, "D": 60}


def percentage_to_letter(percentage: float, grading_scale: dict) -> str:
    """
    Convert a percentage score to a letter grade using the course grading scale.
    The grading_scale dict maps letter grade (A/B/C/D) to minimum percentage.
    """
    # Ensure we have all thresholds; fall back to defaults if missing
    scale = {**DEFAULT_GRADING_SCALE, **grading_scale}
    a_min = scale.get("A", 90)
    b_min = scale.get("B", 80)
    c_min = scale.get("C", 70)
    d_min = scale.get("D", 60)

    if percentage >= a_min + 3:
        return "A+"
    elif percentage >= a_min:
        return "A"
    elif percentage >= a_min - 3:
        return "A-"
    elif percentage >= b_min + 3:
        return "B+"
    elif percentage >= b_min:
        return "B"
    elif percentage >= b_min - 3:
        return "B-"
    elif percentage >= c_min + 3:
        return "C+"
    elif percentage >= c_min:
        return "C"
    elif percentage >= c_min - 3:
        return "C-"
    elif percentage >= d_min + 3:
        return "D+"
    elif percentage >= d_min:
        return "D"
    elif percentage >= d_min - 3:
        return "D-"
    else:
        return "F"


def letter_to_gpa(letter: str) -> float:
    """Convert a letter grade string to GPA points."""
    return GPA_SCALE.get(letter.upper(), 0.0)


def calculate_course_grade(categories: list[dict]) -> dict:
    """
    Calculate the current grade for a single course.

    Each category dict should contain:
        - name: str
        - weight: float (percentage of total grade, e.g. 40.0)
        - score: float | None  (student's average score 0–100, None if not graded)
        - completed: bool  (False means "not graded yet")

    Returns a dict with:
        - weighted_score: float  (percentage, 0–100)
        - is_incomplete: bool
        - completed_weight: float  (sum of weights for completed categories)
    """
    earned_weight = 0.0
    completed_weight = 0.0
    is_incomplete = False

    for cat in categories:
        weight = float(cat.get("weight", 0))
        score = cat.get("score")
        completed = cat.get("completed", True)

        # If no score or marked as not completed, skip for current calculation
        if not completed or score is None:
            is_incomplete = True
            continue

        score = float(score)
        earned_weight += (score / 100.0) * weight
        completed_weight += weight

    if completed_weight == 0:
        return {
            "weighted_score": 0.0,
            "is_incomplete": True,
            "completed_weight": 0.0,
        }

    # Scale to percentage of completed work only
    weighted_score = (earned_weight / completed_weight) * 100.0

    return {
        "weighted_score": round(weighted_score, 2),
        "is_incomplete": is_incomplete,
        "completed_weight": round(completed_weight, 2),
    }


def calculate_overall_gpa(courses: list[dict]) -> dict:
    """
    Calculate overall GPA across multiple courses.

    Each course dict should have:
        - course_name: str
        - course_code: str
        - credit_hours: int (defaults to 3)
        - grading_scale: dict  ({"A": 90, "B": 80, ...})
        - categories: list[dict]  (as described in calculate_course_grade)

    Returns:
        - gpa: float
        - is_incomplete: bool
        - courses: list[dict] per-course breakdown
    """
    total_quality_points = 0.0
    total_credit_hours = 0
    has_incomplete = False
    course_results = []

    for course in courses:
        credit_hours = int(course.get("credit_hours", 3))
        grading_scale = course.get("grading_scale", DEFAULT_GRADING_SCALE)
        categories = course.get("categories", [])

        grade_info = calculate_course_grade(categories)
        weighted_score = grade_info["weighted_score"]
        is_incomplete = grade_info["is_incomplete"]

        letter = percentage_to_letter(weighted_score, grading_scale)
        gpa_points = letter_to_gpa(letter)

        if is_incomplete:
            has_incomplete = True

        total_quality_points += gpa_points * credit_hours
        total_credit_hours += credit_hours

        course_results.append({
            "course_name": course.get("course_name", "Unknown Course"),
            "course_code": course.get("course_code", ""),
            "credit_hours": credit_hours,
            "instructor": course.get("instructor", ""),
            "weighted_score": weighted_score,
            "letter_grade": letter,
            "gpa_points": gpa_points,
            "is_incomplete": is_incomplete,
            "completed_weight": grade_info["completed_weight"],
        })

    overall_gpa = (
        round(total_quality_points / total_credit_hours, 2)
        if total_credit_hours > 0
        else 0.0
    )

    return {
        "gpa": overall_gpa,
        "is_incomplete": has_incomplete,
        "total_credit_hours": total_credit_hours,
        "courses": course_results,
    }


def what_score_needed(
    current_score: float,
    current_weight_completed: float,
    final_weight: float,
    target_percentage: float,
) -> Optional[float]:
    """
    Determine the score needed on an upcoming assignment/final to reach a target percentage.

    Args:
        current_score: Weighted score so far (as %, 0–100), based on completed_weight
        current_weight_completed: Sum of category weights already completed (out of 100)
        final_weight: Weight of the upcoming assignment (out of 100)
        target_percentage: The target overall percentage to achieve

    Returns:
        Required score (0–100), or None if it's mathematically impossible (>100 or <0).
    """
    # current_score is already scaled to 100, but represents only completed_weight portion
    # Overall = (current_score * current_weight_completed + final_score * final_weight) / 100
    # Solve for final_score
    if final_weight <= 0:
        return None

    needed = (target_percentage * 100 - current_score * current_weight_completed) / final_weight

    if needed > 100 or needed < -0.05:
        return None
    needed = max(needed, 0.0)

    return round(needed, 1)
