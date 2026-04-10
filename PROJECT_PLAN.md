# BoilerGPA Next.js Rebuild — Complete File Structure & Plan

## Overview

Migrate from **React CRA + FastAPI** to **Next.js monolithic** (Vercel-only deployment)

---

## FINAL FILE STRUCTURE

```
boilerGPA/
├── README.md                              # Updated with new architecture
├── vercel.json                            # Vercel config (keep existing)
├── package.json                           # Next.js dependencies
├── next.config.js                         # Next.js config
├── tsconfig.json or jsconfig.json         # TypeScript (optional for now, JS is fine)
│
├── public/
│   ├── data/
│   │   └── historical-grades.json         # *** CRITICAL: Static 19k records *** (1.2MB min)
│   │       Format: Array<{ subject, number, instructor, year, semester, a_pct, b_pct, c_pct, d_pct, f_pct }>
│   └── [other static assets]
│
├── app/ (or src/pages/ for Pages Router — recommending App Router)
│   ├── layout.js                          # Root layout
│   ├── page.js                            # Landing page (/ route) — STATS DASHBOARD
│   ├── favicon.ico
│   │
│   ├── calculator/
│   │   └── page.js                        # /calculator route — MAIN APP
│   │
│   └── api/
│       ├── parse-syllabus (directory)
│       │   └── route.js                   # POST /api/parse-syllabus
│       │       - Receives PDF + course code
│       │       - Checks Vercel KV cache
│       │       - If miss: call Claude API
│       │       - Cache result, return JSON
│       │
│       ├── health (directory)
│       │   └── route.js                   # GET /api/health (for monitoring)
│       │
│       └── grades (directory)
│           └── route.js                   # GET /api/grades
│               - Returns historical-grades.json
│               - (or we just serve static file directly)
│
├── lib/
│   ├── claude.js                          # Claude API client wrapper
│   │   - Call claude-sonnet-4-20250514
│   │   - System prompt for parsing
│   │   - Error handling
│   │
│   ├── kv.js                              # Vercel KV helper
│   │   - Cache parsed syllabus structures
│   │   - Get/set patterns
│   │
│   ├── calculator.js                      # *** MIGRATE from backend/calculator.py ***
│   │   - percentage_to_letter()
│   │   - letter_to_gpa()
│   │   - calculate_course_grade()
│   │   - Exact same logic, JS port
│   │
│   ├── predictor.js                       # *** MIGRATE from backend/predictor.py ***
│   │   - compute_historical_avg_pct()
│   │   - _curve_from_mean()
│   │   - predict_for_course()
│   │   - Uses static historical-grades.json
│   │
│   ├── grades.js                          # Historical grades data loader
│   │   - loadHistoricalGrades() → returns parsed JSON
│   │   - filterByCourse(subject, number, instructor?)
│   │   - computeAggregateStats()
│   │
│   ├── syllabus-parser.js                 # Syllabus JSON normalization
│   │   - normalizeClaudeParsedJSON()
│   │   - validateParsedStructure()
│   │
│   └── constants.js                       # Shared constants
│       - DEFAULT_GRADING_SCALE
│       - GPA_SCALE
│       - SEMESTER_OPTIONS
│       - CLAUDE_MODEL, MAX_TOKENS, etc.
│
├── components/
│   ├── ui/
│   │   ├── Button.jsx
│   │   ├── Input.jsx
│   │   ├── Card.jsx
│   │   ├── Modal.jsx
│   │   └── [other reusable UI]
│   │
│   ├── landing/
│   │   ├── HeroSection.jsx
│   │   ├── StatsGrid.jsx                   # Top 5 hardest, easiest, biggest curves
│   │   ├── DataShowcase.jsx                # Compelling visualizations
│   │   └── CTASection.jsx                  # Call-to-action to /calculator
│   │
│   ├── syllabus/
│   │   ├── SyllabusUpload.jsx              # PDF upload + drag-drop
│   │   └── ParsedForm.jsx                  # Dynamically rendered grading form
│   │
│   ├── calculator/
│   │   ├── CourseInput.jsx                 # Single course card
│   │   ├── CategoryRow.jsx                 # Each grading category
│   │   ├── GradeDisplay.jsx                # Current/projected grade
│   │   ├── CurvePredictor.jsx              # Historical curve info
│   │   └── Results.jsx                     # Summary view
│   │
│   └── layout/
│       ├── Header.jsx
│       ├── Footer.jsx
│       └── Navigation.jsx
│
├── hooks/
│   ├── useCalculator.js                   # State for grade calculator
│   ├── useSyllabus.js                     # Syllabus parsing state
│   ├── useCurvePrediction.js              # Curve lookup + stats
│   └── useLocalStorage.js                 # Persist calculator state
│
├── styles/
│   ├── globals.css                        # Tailwind + global styles
│   └── tailwind.config.js
│
└── .env.local (GITIGNORE)
    - ANTHROPIC_API_KEY=sk-ant-...
    - KV_REST_API_URL=[from Vercel]
    - KV_REST_API_TOKEN=[from Vercel]
    - REACT_APP_API_BASE (not needed — use /api internally)

```

---

## BUILD ORDER (Tonight)

### **Step 1: Data Pipeline** (20 min)

- Export BoilerGrades CSV → `historical-grades.json` in `public/data/`
- Validate structure & compression (1-3MB target)
- Test JSON loads correctly in browser

### **Step 2: Next.js Scaffolding** (15 min)

- Init Next.js project (or convert existing CRA)
- Install deps: `next`, `react`, `react-dom`, `@vercel/kv`, `anthropic`
- Setup Tailwind CSS config
- Create `app/` directory structure

### **Step 3: Backend Porting** (30 min)

- Port `calculator.py` → `lib/calculator.js`
- Port `predictor.py` → `lib/predictor.js`
- Create `lib/grades.js` (load + filter historical JSON)
- Create `lib/claude.js` (Claude API wrapper)
- Create `lib/kv.js` (Vercel KV boilerplate)

### **Step 4: API Routes** (25 min)

- `app/api/parse-syllabus/route.js` — PDF upload + Claude parsing + KV caching
- `app/api/health/route.js` — Health check
- `app/api/grades/route.js` — Return historical grades (or just serve static file)

### **Step 5: Calculator App** (40 min)

- `components/calculator/` — all grade input/display components
- `hooks/useCalculator.js` — state management
- `app/calculator/page.js` — Main grade calculator page
- Integrate syllabus upload flow
- Wire up curve predictor

### **Step 6: Landing Page** (30 min)

- `components/landing/` — hero, stats grid, CTA
- Query stats from `historical-grades.json`:
  - Top 5 hardest courses (lowest avg GPA)
  - Top 5 easiest courses (highest avg GPA)
  - Biggest curve examples
  - Total records + subjects coverage
- `app/page.js` — Landing page

### **Step 7: Polish** (20 min)

- Fix any TypeScript/lint errors
- Test locally
- Verify Vercel deployment ready

---

## WHAT TO DELETE

❌ Remove entirely (not migrating):

- `backend/` ← entire FastAPI folder
- `frontend/src/hooks/useDashboard.js` ← crowdsourced features
- `frontend/src/components/Dashboard.jsx` ← dashboard (not in New Vision)
- `frontend/src/components/ExportImportModal.jsx` ← not needed
- `frontend/src/components/CourseDetailModal.jsx` ← was for detailed stats, can simplify
- Backend endpoints for: community templates, grade submissions, class stats reports

✅ Migrate / keep logic:

- `parser.py` → convert Claude prompting to `lib/claude.js`
- `calculator.py` → port to `lib/calculator.js`
- `predictor.py` → port to `lib/predictor.js`
- Core React components (simplify for new flow)

---

## ENVIRONMENT SETUP

**Vercel KV Setup (Free Tier):**

```bash
vercel env pull  # Get KV_REST_API_URL & KV_REST_API_TOKEN
```

**.env.local:**

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
KV_REST_API_URL=https://xxxx.kv.vercel.app
KV_REST_API_TOKEN=xxxxxx_xxxxxx
```

---

## KEY DECISIONS

1. **No TypeScript** (for speed — JS+JSDoc is fine for MVP)
2. **Tailwind CSS** (already in project, keep it)
3. **App Router** (Next.js 13+ recommended)
4. **Static JSON for grades** (load once, use client-side)
5. **Vercel KV only** (no other persistent storage)
6. **Claude Sonnet 4** (for parsing accuracy)
7. **GPL v3 License** (respect BoilerGrades)

---

## SUCCESS CRITERIA ✅

- [ ] `npm run dev` works locally
- [ ] `/` shows compelling stats
- [ ] `/calculator` loads with syllabus upload
- [ ] PDF parsing hits Claude + stores in KV
- [ ] Grade calculator works with dynamic form
- [ ] Curve prediction displays from static JSON
- [ ] `vercel deploy` succeeds
- [ ] No FastAPI/SQLite dependencies
- [ ] No crowdsourcing features

---

## Estimated Time

- Data export: 20 min
- Next.js setup: 15 min
- Backend porting: 30 min
- API routes: 25 min
- Calculator UI: 40 min
- Landing page: 30 min
- Polish: 20 min
- **Total: ~3 hours**

---

**Ready? Approve this structure and we'll build it step-by-step, starting with the data pipeline.**
