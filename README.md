# BoilerGPA

GPA helper for Purdue students: upload a syllabus PDF (or add a course by search), enter how you’re doing, and see a weighted GPA plus a **rough** guess at how grading might shake out if the class curves like it has in the past.

Nothing here is academic or legal advice — it’s a tool built for a hackathon. Treat predictions as conversation starters, not guarantees.

---

## What actually works today

- **Syllabus PDF upload** — The backend pulls text (and some table/layout hints) with PyMuPDF, then asks **Claude Haiku** to return structured categories, weights, and an optional grading scale. Messy syllabi, weird layouts, or scanned/image-only PDFs can still come back wrong or fall back to a generic template; you can edit everything by hand afterward.
- **Manual courses** — Search pulls from your **local** scraped catalog when you’ve run the scraper; otherwise it hits **Purdue’s public OData API** (`api.purdue.io`) when possible.
- **Weighted GPA** — Categories are treated as percentages of the course grade; the server computes current GPA-style numbers from what you entered.
- **“What do I need on the final?”** — On the results screen there’s a small calculator. Right now it uses **fixed cutoffs (90 / 80 / 70 / 60)** in the browser. The backend also exposes `/what-score-needed`, which **can** use your syllabus grading scale, but the main UI doesn’t call that yet.
- **Curve-style prediction** — Uses a simple heuristic (if the estimated class average sits below the “B” line on *your* scale, it applies a partial bump). Data priority in code is roughly: **stats you enter** → **community-reported class stats** (σ / reporting flow) → **anonymous letter-grade submissions** from other users (when there are enough) → **imported BoilerGrades distributions** → otherwise it admits **low confidence** and mostly shows your raw score.
- **Optional AI blurb** — “Explain this curve” calls **Claude** again; needs `ANTHROPIC_API_KEY`.
- **Community templates** — When you search by course code, you can see star-ranked structures other people submitted; starring hits the API.
- **Dashboard flow** (separate from the main GPA wizard) can **submit anonymous final letter grades** to grow the crowd dataset.

If the API key is missing, syllabus parsing won’t work (the safe path returns a partial/default layout). The health endpoint and a lot of the math still run.

---

## Honest limitations

- **Predictions are not verified against real curves** — They’re heuristics plus whatever data happened to be in the database.
- **Historical data has gaps** — BoilerGrades coverage is whatever’s in the upstream CSVs; instructor matching is last-name based and imperfect.
- **BoilerGrades data does not load by itself** — Starting the server creates/opens SQLite tables; to fill **`historical_grade_stats`** from the public [boiler-grades](https://github.com/eduxstad/boiler-grades) repo, run:

  ```bash
  cd backend && source .venv/bin/activate   # or activate.fish on fish
  python import_boilergrades.py
  ```

  That project is **GPL v3**; we’re just importing aggregated distributions (no per-student rows).

- **One frontend bug to know if you deploy** — Class-stat reporting in `CourseDetailModal` still posts to a hardcoded `http://localhost:8000` URL in places; the rest of the app uses `REACT_APP_API_BASE`. Fix that before pointing the UI at a remote API.

---

## Stack (straight version)

- **Frontend:** React 18, talks to the backend over HTTP (`REACT_APP_API_BASE`, default `http://localhost:8000`).
- **Backend:** FastAPI, SQLite (`backend/data/boilergpa.db`), Anthropic for syllabus parse + curve explanation.

The browser never holds your Anthropic key; only the server does.

---

## Setup

**You’ll need:** Python 3.11+, Node 18+, and an [Anthropic API key](https://console.anthropic.com) for full functionality.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
# fish: source .venv/bin/activate.fish

pip install -r requirements.txt
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn main:app --reload --port 8000
```

Server: `http://localhost:8000`

Optional but recommended for curve data:

```bash
python import_boilergrades.py
```

### Frontend

```bash
cd frontend
npm install
npm start
```

App: `http://localhost:3000`

### Optional: scrape the catalog for faster search

```bash
cd backend
source .venv/bin/activate
python scraper.py -sem "Spring 2026"
```

Uses Selenium + Chrome; `webdriver-manager` grabs a driver. Skip this if you’re fine with the Purdue API fallback (slower, needs network).

---

## Environment variables

**Backend** (`backend/.env`):

```text
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

`ALLOWED_ORIGINS` is comma-separated. Defaults are localhost-friendly.

**Frontend** (`frontend/.env.local` or `.env`):

```text
REACT_APP_API_BASE=http://localhost:8000
```

---

## API (what’s implemented)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | DB-ish stats |
| `POST` | `/parse-syllabus` | PDF upload; rate limited |
| `POST` | `/calculate-gpa` | Body: `{ "courses": [...] }` |
| `POST` | `/predict-gpa` | Same shape; returns per-course predictions |
| `POST` | `/what-score-needed` | Uses request `grading_scale` |
| `POST` | `/explain-curve` | Claude; rate limited; needs API key |
| `GET` | `/courses/search?q=` | Local DB first, then Purdue OData |
| `GET` | `/courses/semesters` | Scraped semesters |
| `DELETE` | `/courses/semester/{semester}` | Wipe one scraped term |
| `GET` | `/courses/{subject}/{number}/template` | Canonical template from prior parses |
| `POST` | `/submit-grades` | Anonymous letter grades; rate limited |
| `POST` | `/community/submit` | Publish a structure (no scores) |
| `GET` | `/community/templates/{course_code}` | e.g. `CS25200` |
| `POST` | `/community/star/{template_id}` | Rate limited |
| `POST` | `/class-stats/report` | Crowd class stats |
| `GET` | `/class-stats/{course_code}` | Aggregated stats |

Interactive docs: `http://localhost:8000/docs` when the server is running.

---

## How syllabus parsing roughly works

PyMuPDF reads the PDF (text, tables, and a layout pass for stray `%` labels). The interesting chunk gets sent to Claude with a strict JSON shape. If JSON or weight totals are off, the backend may retry once. Successful parses can update the per-course template table for future users.

---

Built for CATAPULT Hackathon · Purdue University
