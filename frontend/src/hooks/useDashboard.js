/**
 * useDashboard — central state for the BoilerGPA dashboard
 *
 * Structure persisted to localStorage:
 *   { semesters: { 'Fall 2025': { courses: [...] }, ... }, activeSemester: 'Fall 2025' }
 *
 * Category data model:
 *   { name, weight, count, completed, entryMode: 'average'|'individual', score, scores: [] }
 *
 * When entryMode === 'individual', `scores` is an array of `count` strings.
 * The effective score sent to the backend is the average of non-empty entries.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

const API_BASE = 'http://localhost:8000';
const STORAGE_KEY = 'boilergpa_v2';

export const SEMESTER_OPTIONS = [
  'Fall 2023', 'Spring 2024', 'Summer 2024',
  'Fall 2024', 'Spring 2025', 'Summer 2025',
  'Fall 2025', 'Spring 2026', 'Summer 2026', 'Fall 2026',
];

// ---- helpers ----------------------------------------------------------------

function makeCourse(data = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    course_name: data.course_name || '',
    course_code: data.course_code || '',
    instructor: data.instructor || 'Staff',
    credit_hours: data.credit_hours || 3,
    grading_scale: data.grading_scale || { A: 90, B: 80, C: 70, D: 60 },
    categories: (data.categories || []).map(normalizeCat),
  };
}

function _normalizeClassStats(existing, count) {
  const arr = Array.isArray(existing) ? existing : [];
  // Grow or shrink to match count, preserving existing entries
  return Array.from({ length: count }, (_, i) => arr[i] ?? null);
}

function normalizeCat(cat) {
  return {
    name: cat.name || '',
    weight: cat.weight ?? 0,
    count: cat.count ?? 1,
    completed: cat.completed !== false,
    entryMode: cat.entryMode || 'average',
    score: cat.score !== undefined ? cat.score : '',
    scores: Array.isArray(cat.scores) ? cat.scores : [],
    // Per-item class stats released by the professor — one entry per count
    // Each entry: { min, max, mean, median, stdDev } | null
    classStats: _normalizeClassStats(cat.classStats, cat.count ?? 1),
  };
}

/** Get the effective numeric score for a category (null = no data yet).
 *  In individual mode, empty slots are filled with the average of entered scores.
 */
export function effectiveScore(cat) {
  if (cat.entryMode === 'individual') {
    const count = cat.count || 1;
    const slots = cat.scores.length === count ? cat.scores : Array(count).fill('');
    const nums = slots.map(parseFloat).filter((n) => !isNaN(n));
    if (nums.length === 0) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    // All slots (including empty ones) contribute the average
    return avg;
  }
  const v = parseFloat(cat.score);
  return isNaN(v) ? null : v;
}

/** Average of entered individual scores — used to show the auto-fill placeholder. */
export function enteredAverage(cat) {
  if (cat.entryMode !== 'individual') return null;
  const nums = (cat.scores || []).map(parseFloat).filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Local GPA calculation — mirrors backend calculator.py logic.
 * Returns { gpa, letter, weightedScore, completedWeight, isIncomplete }
 */
export function calcLocalGPA(course) {
  const scale = { A: 90, B: 80, C: 70, D: 60, ...course.grading_scale };
  let earned = 0, completedW = 0, isIncomplete = false;

  for (const cat of course.categories) {
    const score = effectiveScore(cat);
    if (!cat.completed || score === null) { isIncomplete = true; continue; }
    earned += (score / 100) * cat.weight;
    completedW += cat.weight;
  }

  if (completedW === 0) return { gpa: null, letter: '—', weightedScore: null, completedWeight: 0, isIncomplete: true };

  const ws = (earned / completedW) * 100;
  const letter = pctToLetter(ws, scale);
  const gpa = letterToGPA(letter);
  return { gpa, letter, weightedScore: Math.round(ws * 10) / 10, completedWeight: Math.round(completedW), isIncomplete };
}

const GPA_SCALE = { 'A+': 4.0, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0.0 };

export function letterToGPA(letter) { return GPA_SCALE[letter] ?? 0; }

export function pctToLetter(pct, scale) {
  const a = scale.A ?? 90, b = scale.B ?? 80, c = scale.C ?? 70, d = scale.D ?? 60;
  if (pct >= a + 3) return 'A+';
  if (pct >= a)     return 'A';
  if (pct >= a - 3) return 'A-';
  if (pct >= b + 3) return 'B+';
  if (pct >= b)     return 'B';
  if (pct >= b - 3) return 'B-';
  if (pct >= c + 3) return 'C+';
  if (pct >= c)     return 'C';
  if (pct >= c - 3) return 'C-';
  if (pct >= d + 3) return 'D+';
  if (pct >= d)     return 'D';
  if (pct >= d - 3) return 'D-';
  return 'F';
}

export function calcSemesterGPA(courses) {
  let qp = 0, ch = 0;
  for (const course of courses) {
    const { gpa } = calcLocalGPA(course);
    if (gpa === null) continue;
    qp += gpa * (course.credit_hours || 3);
    ch += course.credit_hours || 3;
  }
  return ch > 0 ? Math.round((qp / ch) * 100) / 100 : null;
}

/**
 * Project cumulative GPA after adding the current semester's results.
 * Uses Purdue's transcript values directly: GPA Hours and Quality Points.
 */
export function calcCumulativeGPA(courses, priorQP, priorHours) {
  const pqp = parseFloat(priorQP);
  const ph = parseFloat(priorHours);
  if (isNaN(pqp) || isNaN(ph) || ph < 0) return null;

  let semQP = 0, semCH = 0;
  for (const course of courses) {
    const { gpa } = calcLocalGPA(course);
    if (gpa === null) continue;
    semQP += gpa * (course.credit_hours || 3);
    semCH += course.credit_hours || 3;
  }

  const totalQP = pqp + semQP;
  const totalCH = ph + semCH;
  return totalCH > 0 ? Math.round((totalQP / totalCH) * 100) / 100 : null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ---- hook -------------------------------------------------------------------

const DEFAULT_SEMESTER = 'Spring 2026';

export function useDashboard() {
  const saved = useMemo(() => loadState(), []);

  const [semesters, setSemesters] = useState(
    saved?.semesters || { [DEFAULT_SEMESTER]: { courses: [] } }
  );
  const [activeSemester, setActiveSemester] = useState(
    saved?.activeSemester || DEFAULT_SEMESTER
  );
  const [priorQP, setPriorQP] = useState(saved?.priorQP ?? '');
  const [priorHours, setPriorHours] = useState(saved?.priorHours ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [predictedResult, setPredictedResult] = useState(null);

  // Persist on every state change
  useEffect(() => {
    saveState({ semesters, activeSemester, priorQP, priorHours });
  }, [semesters, activeSemester, priorQP, priorHours]);

  // Debounced prediction fetch — fires 1.5s after courses stop changing
  const courses = semesters[activeSemester]?.courses || [];
  useEffect(() => {
    if (courses.length === 0) { setPredictedResult(null); return; }
    const hasAnyScore = courses.some((c) =>
      c.categories.some((cat) => effectiveScore(cat) !== null)
    );
    if (!hasAnyScore) { setPredictedResult(null); return; }

    const timer = setTimeout(async () => {
      try {
        // Sanitize: backend expects score as float|null, not empty string
        const sanitized = courses.map((c) => ({
          ...c,
          categories: c.categories.map((cat) => ({
            ...cat,
            score: cat.score === '' || cat.score === undefined ? null : Number(cat.score),
          })),
        }));
        const resp = await fetch(`${API_BASE}/predict-gpa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courses: sanitized }),
        });
        if (!resp.ok) return;
        const { data } = await resp.json();
        setPredictedResult(data);
      } catch { /* silent fail — prediction is best-effort */ }
    }, 1500);

    return () => clearTimeout(timer);
  }, [JSON.stringify(courses)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- semester actions ----

  const addSemester = useCallback((name) => {
    setSemesters((prev) => ({ ...prev, [name]: prev[name] || { courses: [] } }));
    setActiveSemester(name);
  }, []);

  // ---- course actions ----

  const _updateSemesterCourses = useCallback((sem, fn) => {
    setSemesters((prev) => ({
      ...prev,
      [sem]: { ...prev[sem], courses: fn(prev[sem]?.courses || []) },
    }));
  }, []);

  const addCourse = useCallback((courseData) => {
    const course = makeCourse(courseData);
    _updateSemesterCourses(activeSemester, (cs) => [...cs, course]);
    return course.id;
  }, [activeSemester, _updateSemesterCourses]);

  const removeCourse = useCallback((courseId) => {
    _updateSemesterCourses(activeSemester, (cs) => cs.filter((c) => c.id !== courseId));
  }, [activeSemester, _updateSemesterCourses]);

  const updateCourse = useCallback((courseId, updates) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => c.id === courseId ? { ...c, ...updates } : c)
    );
  }, [activeSemester, _updateSemesterCourses]);

  // ---- category actions ----

  const updateCategory = useCallback((courseId, catIdx, updates) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        return {
          ...c,
          categories: c.categories.map((cat, i) => {
            if (i !== catIdx) return cat;
            const merged = { ...cat, ...updates };
            // If count changed, resize classStats and scores arrays to match
            if (updates.count !== undefined && updates.count !== cat.count) {
              merged.classStats = _normalizeClassStats(merged.classStats, updates.count);
              merged.scores = Array.from({ length: updates.count }, (_, j) => merged.scores[j] ?? '');
            }
            return merged;
          }),
        };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  const updateAssignmentScore = useCallback((courseId, catIdx, scoreIdx, value) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        return {
          ...c,
          categories: c.categories.map((cat, i) => {
            if (i !== catIdx) return cat;
            const scores = [...(cat.scores.length === cat.count ? cat.scores : Array(cat.count).fill(''))];
            scores[scoreIdx] = value;
            return { ...cat, scores };
          }),
        };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  const toggleEntryMode = useCallback((courseId, catIdx) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        return {
          ...c,
          categories: c.categories.map((cat, i) => {
            if (i !== catIdx) return cat;
            const next = cat.entryMode === 'average' ? 'individual' : 'average';
            const scores = next === 'individual' && cat.scores.length !== cat.count
              ? Array(cat.count).fill('')
              : cat.scores;
            return { ...cat, entryMode: next, scores };
          }),
        };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  const addCategory = useCallback((courseId) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        return {
          ...c,
          categories: [...c.categories, normalizeCat({ name: '', weight: 0, count: 1 })],
        };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  const removeCategory = useCallback((courseId, catIdx) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        return { ...c, categories: c.categories.filter((_, i) => i !== catIdx) };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  const reorderCategories = useCallback((courseId, oldIndex, newIndex) => {
    _updateSemesterCourses(activeSemester, (cs) =>
      cs.map((c) => {
        if (c.id !== courseId) return c;
        const cats = [...c.categories];
        const [moved] = cats.splice(oldIndex, 1);
        cats.splice(newIndex, 0, moved);
        return { ...c, categories: cats };
      })
    );
  }, [activeSemester, _updateSemesterCourses]);

  // ---- API calls ----

  const parseSyllabus = useCallback(async (file) => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch(`${API_BASE}/parse-syllabus`, { method: 'POST', body: formData });
      const json = await resp.json().catch(() => ({}));
      // Always return data — backend guarantees a result (partial or full)
      return { data: json.data || {}, partial: json.partial ?? !resp.ok };
    } catch {
      // Network error — return empty defaults so user can fill manually
      return { data: {}, partial: true };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchCourses = useCallback(async (query) => {
    if (!query || query.length < 2) return [];
    try {
      const resp = await fetch(`${API_BASE}/courses/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) return [];
      const { data } = await resp.json();
      return data || [];
    } catch { return []; }
  }, []);

  const fetchTemplate = useCallback(async (subject, number) => {
    try {
      const resp = await fetch(
        `${API_BASE}/courses/${encodeURIComponent(subject)}/${encodeURIComponent(number)}/template`
      );
      if (!resp.ok) return null;
      const { data } = await resp.json();
      return data || null;
    } catch { return null; }
  }, []);

  const exportData = useCallback(() => {
    const payload = { semesters, activeSemester, priorQP, priorHours };
    const json = JSON.stringify(payload);
    // Use encodeURIComponent to safely handle unicode, then base64 encode
    return 'bgpa_v1_' + btoa(encodeURIComponent(json));
  }, [semesters, activeSemester, priorQP, priorHours]);

  const importData = useCallback((raw) => {
    if (typeof raw !== 'string' || !raw.startsWith('bgpa_v1_')) {
      throw new Error('Invalid format — must start with bgpa_v1_');
    }
    let data;
    try {
      const json = decodeURIComponent(atob(raw.slice('bgpa_v1_'.length)));
      data = JSON.parse(json);
    } catch {
      throw new Error('Corrupted data — could not decode');
    }
    if (!data.semesters || typeof data.semesters !== 'object') {
      throw new Error('Invalid data — missing semester data');
    }
    setSemesters(data.semesters);
    if (data.activeSemester && data.semesters[data.activeSemester]) {
      setActiveSemester(data.activeSemester);
    }
    if (data.priorQP !== undefined) setPriorQP(data.priorQP);
    if (data.priorHours !== undefined) setPriorHours(data.priorHours);
  }, []);

  const submitGrades = useCallback(async (entriesOverride) => {
    const entries = entriesOverride || courses.flatMap((course) => {
      const { letter } = calcLocalGPA(course);
      if (!letter || letter === '—') return [];
      const [subject, ...rest] = course.course_code.replace(/[^A-Za-z0-9]/g, '').match(/^([A-Za-z]+)(\d+)/) || [];
      if (!subject) return [];
      return [{
        subject: subject[1] || '',
        number: subject[2] || '',
        instructor: course.instructor,
        semester: activeSemester,
        letter: letter.replace(/[+-]/, ''),
      }];
    });
    if (entries.length === 0) return;
    try {
      await fetch(`${API_BASE}/submit-grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
    } catch {}
  }, [courses, activeSemester]);

  return {
    semesters,
    activeSemester,
    setActiveSemester,
    addSemester,
    courses,
    addCourse,
    removeCourse,
    updateCourse,
    updateCategory,
    updateAssignmentScore,
    toggleEntryMode,
    addCategory,
    removeCategory,
    parseSyllabus,
    searchCourses,
    fetchTemplate,
    submitGrades,
    exportData,
    importData,
    reorderCategories,
    priorQP,
    setPriorQP,
    priorHours,
    setPriorHours,
    isLoading,
    error,
    setError,
    predictedResult,
  };
}
