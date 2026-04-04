# BoilerGPA

**Know exactly where you stand.**

Purdue University GPA prediction tool. Upload your syllabus, enter your scores, and get your predicted final GPA — with historical curve data from BoilerGrades.

## Stack

- **Backend**: Python, FastAPI, PyMuPDF, Anthropic Claude API
- **Frontend**: React 18, Framer Motion, Tailwind CSS
- **Data**: BoilerGrades (MIT), Purdue public OData API

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start
# Opens at http://localhost:3000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/parse-syllabus` | Upload PDF → Claude extracts grading structure |
| `POST` | `/calculate-gpa` | Compute current GPA from entered scores |
| `POST` | `/predict-gpa` | Predict final GPA with historical curve data |
| `GET`  | `/courses/search?q=cs251` | Search Purdue course catalog |
| `POST` | `/what-score-needed` | What score needed on final to hit each grade |
| `GET`  | `/health` | Health check |

## Features

- **AI Syllabus Parsing** — Claude extracts grading categories, weights, and scale from any PDF syllabus
- **Historical Curve Prediction** — Cross-references BoilerGrades data by course + instructor
- **Incomplete Course Handling** — Toggle individual categories as "not graded yet"
- **Score Calculator** — Find out what you need on the final per letter grade
- **Share** — Copy a one-line summary to clipboard

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Data Sources

- **BoilerGrades** — Grade distribution data from Purdue public records request (MIT licensed, FERPA compliant)
- **Purdue OData API** — `https://api.purdue.io/odata/` — public course catalog

---

Built for CATAPULT Hackathon · Purdue University
