# BoilerGPA

**Know exactly where you stand.**

A GPA calculator and curve predictor built for Purdue students. Upload your syllabus PDF, enter your scores, and BoilerGPA tells you your current GPA — plus what it's likely to be after the curve.

---

## What it actually does

Most grade calculators just do weighted math. BoilerGPA does three things on top of that:

1. **Reads your syllabus for you.** Drop in the PDF, and Claude (Haiku) extracts the grading categories, their weights, assignment counts, drop policies, and the grading scale — no manual entry required.

2. **Predicts your final grade with curve data.** It cross-references your score against historical grade distributions from [BoilerGrades](https://boilergrades.com) (public records data, MIT licensed). If the class historically averages a 72%, it estimates the curve and bumps your predicted grade accordingly.

3. **Answers "what do I need on the final?"** Given how much of the course is left, it solves backwards to tell you the exact score required to land each letter grade.

---

## How the stack fits together

```
Browser (React 18)
  │
  │  POST /parse-syllabus  (multipart PDF)
  │  POST /calculate-gpa   (JSON scores)
  │  POST /predict-gpa     (JSON scores)
  │  GET  /courses/search  (search query)
  ▼
FastAPI (Python 3.13)
  ├── parser.py       — PyMuPDF extracts text/tables → Claude Haiku → structured JSON
  ├── calculator.py   — Weighted GPA math, letter grade conversion
  ├── predictor.py    — Curve inference from class stats or historical data
  └── db.py           — SQLite: course catalog + anonymous grade submissions
```

The frontend never calls Claude directly. All AI calls go through the backend so the API key stays server-side.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create your .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn main:app --reload --port 8000
```

The server starts at `http://localhost:8000`. On first boot it creates `backend/data/boilergpa.db` and imports the BoilerGrades CSV into SQLite.

### Frontend

```bash
cd frontend
npm install
npm start
# Opens at http://localhost:3000
```

### (Optional) Scrape the Purdue course catalog

The course search falls back to Purdue's live OData API if the local DB is empty, so this step isn't required. But if you want fast offline search:

```bash
cd backend
source .venv/bin/activate
python scraper.py -sem "Spring 2026"
```

This uses Selenium + ChromeDriver to pull course data from MyPurdue. `webdriver-manager` handles the driver install automatically.

---

## How syllabus parsing works

When a PDF is uploaded:

1. **PyMuPDF** extracts raw text and converts any tables to Markdown. It also does a second spatial pass to find `\d+%` tokens and their surrounding words — this catches grading info inside pie charts or scattered visual layouts.

2. The text is trimmed to the grading-relevant section only (anchored by headers like "Assessment Weights" or the last `%` sign in the document), keeping costs low.

3. The trimmed text is sent to **Claude Haiku** with a strict system prompt that demands a specific JSON schema: category names, weights (must sum to 1.0), counts, drop policies, and the grading scale.

4. If the JSON is invalid or weights don't sum, the backend retries once with a repair prompt before giving up.

5. The normalized result is saved as a community template so future users of the same course get it pre-filled.

---

## How curve prediction works

For each course, the predictor tries three data sources in order:

| Priority | Source | Confidence |
|---|---|---|
| 1 | Class stats entered by the student (professor releases mean/std dev) | High |
| 2 | Crowd-reported stats from other users this semester | High |
| 3 | Historical grade distributions from BoilerGrades CSV | Medium/Low |
| 4 | Nothing — raw score only | Low |

The curve logic: if the class mean is below the B threshold (default 80%), the predictor estimates a partial correction. It uses smaller multipliers for historical data (more uncertainty) and larger ones for current-semester stats (professor actually released numbers).

---

## API reference

| Method | Endpoint | What it does |
|---|---|---|
| `POST` | `/parse-syllabus` | Upload a PDF → returns grading categories + weights |
| `POST` | `/calculate-gpa` | Compute current GPA from entered scores |
| `POST` | `/predict-gpa` | Predict final GPA with curve estimation |
| `GET` | `/courses/search?q=cs251` | Search Purdue course catalog (local DB → Purdue API fallback) |
| `POST` | `/what-score-needed` | What score is needed on a final to hit each letter grade |
| `POST` | `/explain-curve` | Claude Haiku writes a 2-3 sentence explanation of a prediction |
| `POST` | `/submit-grades` | Anonymously submit your final letter grades to improve predictions |
| `GET` | `/community/templates/{course_code}` | Get community-submitted grading structures for a course |
| `POST` | `/class-stats/report` | Report class statistics (mean, std dev) for a course |
| `GET` | `/health` | Returns DB stats |

---

## Environment variables

**Backend** (`backend/.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=http://localhost:3000,https://your-deployed-frontend.com
```

**Frontend** (`.env` or `frontend/.env.local`):
```
REACT_APP_API_BASE=http://localhost:8000
```

`ANTHROPIC_API_KEY` is the only required variable. `ALLOWED_ORIGINS` defaults to `localhost:3000` and `REACT_APP_API_BASE` defaults to `localhost:8000`, so local dev works with zero config.

---

## Data sources

- **BoilerGrades** — Grade distribution data from a Purdue public records request. MIT licensed, FERPA compliant (no individual student data). Stored in `backend/data/boilergrades.csv`.
- **Purdue OData API** — `https://api.purdue.io/odata/` — public course catalog used as a live fallback when the local DB hasn't been scraped yet.

---

---

## Problems I had to fix

These are real bugs found and patched after the initial build. Documenting them here because they're the kind of thing that silently breaks a project mid-demo.

### `explain-curve` was blocking the entire server

`/explain-curve` used the synchronous `anthropic.Anthropic` client inside an `async` FastAPI handler — no `await`, no thread pool. Every request froze the event loop for the duration of the Claude call (~1-2 seconds). Under concurrent load (multiple browser tabs, anyone hitting the API), all other requests would queue behind it. Fixed by wrapping the sync call in `asyncio.to_thread()`.

### `what-score-needed` ignored your professor's grading scale

The endpoint hardcoded `{"A": 90, "B": 80, "C": 70, "D": 60}` regardless of what was in the syllabus. If your professor uses a 93/83/73 cutoff (common in engineering courses), "what do I need for an A?" was giving the wrong answer. Fixed by adding `grading_scale` to the `FinalScoreNeededRequest` model and reading targets from it.

### CORS and API base URL were hardcoded to localhost

The CORS whitelist in `main.py` was a literal `["http://localhost:3000"]` and the frontend had `const API_BASE = 'http://localhost:8000'` hardcoded. Deploying either service anywhere — or even running the frontend from a different port — would silently break all API calls. Fixed with an `ALLOWED_ORIGINS` env var on the backend and `REACT_APP_API_BASE` on the frontend, both with sensible localhost defaults so local dev requires zero config changes.

### Grade submission endpoint had no abuse protection

`POST /submit-grades` accepted unlimited entries per request with no rate limiting. Someone could flood it with fake A grades for a course and corrupt the historical distribution data that other users rely on for curve predictions. Fixed with `slowapi` rate limiting (5 req/min per IP) and a hard cap of 20 entries per request. Same rate limiting applied to `/parse-syllabus` (10/min) and `/explain-curve` (30/min) to protect Claude API credits.

### Community template starring was unbounded

`POST /community/star/{template_id}` had no auth and no rate limit — any script could inflate star counts on any template indefinitely. Fixed with a 10/min per-IP rate limit via `slowapi`.

### Dead variable in `calculate_course_grade`

`total_weight` was computed in the loop but never used — the division at the end used `completed_weight` correctly, but `total_weight` just accumulated silently. Removed.

### `what_score_needed` returned `None` for a valid score of 0

The function returned `None` if `needed < 0`, but floating-point arithmetic can produce `-0.00001` when the answer is mathematically `0` (student just needs to submit something). That `None` propagated to the frontend as "impossible" instead of "you just need to turn it in." Fixed with a `-0.05` tolerance and `max(needed, 0.0)` after the guard.

---

Built for CATAPULT Hackathon · Purdue University
