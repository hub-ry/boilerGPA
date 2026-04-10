'use client';

import { useState, useEffect, useMemo } from 'react';
import { Logo } from '@/components/Logo';
import { SyllabusUpload } from '@/components/syllabus/SyllabusUpload';
import { CourseCard } from '@/components/calculator/CourseCard';
import { CumulativeSummary } from '@/components/calculator/CumulativeSummary';
import { loadHistoricalGrades, findHardestCourses, findEasiestCourses, computeAggregateStats } from '@/lib/grades';

const STORAGE_KEY = 'boilergpa_courses_v1';
const CUMULATIVE_KEY = 'boilergpa_cumulative_v1';
const TABS = ['GPA Calculator', 'Spring 2026 Statistics'];

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function loadCumulative() {
  try { return JSON.parse(localStorage.getItem(CUMULATIVE_KEY) || '{}'); } catch { return {}; }
}

// ─── Spring 2026 Statistics tab ──────────────────────────────────────────────

function StatsTab({ grades }) {
  const hardest = useMemo(() => findHardestCourses(grades, 8), [grades]);
  const easiest = useMemo(() => findEasiestCourses(grades, 8), [grades]);

  const worstExamAvg = useMemo(() => {
    if (!grades.length) return null;
    const map = {};
    for (const r of grades) {
      const k = `${r.subject} ${r.number}`;
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }
    return Object.entries(map)
      .filter(([, rs]) => rs.length >= 3)
      .map(([code, rs]) => ({ code, ...computeAggregateStats(rs) }))
      .sort((a, b) => a.classAvg - b.classAvg)
      .slice(0, 1)[0] ?? null;
  }, [grades]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Live data notice */}
      <div className="border border-white/10 bg-white/5 p-5 mb-10">
        <p className="text-charcoal-400 text-sm">
          <span className="text-gold-500 font-semibold">Spring 2026</span> live rankings will appear here as students report data.
          Historical rankings below are based on 2021–2025 recorded sections.
        </p>
      </div>

      {/* Worst exam average callout */}
      {worstExamAvg && (
        <div className="mb-10 border border-white/10 bg-white/5 p-6">
          <p className="text-xs text-charcoal-500 uppercase tracking-widest mb-2">Historically roughest class average</p>
          <div className="flex items-end gap-4">
            <span className="text-4xl font-bold text-gold-500">{worstExamAvg.code}</span>
            <span className="text-2xl font-bold text-red-400">{worstExamAvg.classAvg}%</span>
            <span className="text-charcoal-500 text-sm pb-1">avg class score across {worstExamAvg.recordCount} sections</span>
          </div>
        </div>
      )}

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Hardest */}
        <div>
          <h3 className="font-bold text-lg mb-1">Most Cooked</h3>
          <p className="text-charcoal-500 text-sm mb-4">Lowest avg GPA — min. 2 sections</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-charcoal-500 text-xs">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Course</th>
                <th className="text-right py-2">Avg GPA</th>
                <th className="text-right py-2">Class Avg</th>
              </tr>
            </thead>
            <tbody>
              {hardest.map((c, i) => (
                <tr key={c.code} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-charcoal-600">{i + 1}</td>
                  <td className="py-2 font-semibold">{c.code}</td>
                  <td className="py-2 text-right text-red-400 font-bold tabular-nums">{c.avg_gpa.toFixed(2)}</td>
                  <td className="py-2 text-right text-charcoal-400 tabular-nums">{c.class_avg?.toFixed(1) ?? '—'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Easiest */}
        <div>
          <h3 className="font-bold text-lg mb-1">Highest Performers</h3>
          <p className="text-charcoal-500 text-sm mb-4">Highest avg GPA — min. 2 sections</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-charcoal-500 text-xs">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Course</th>
                <th className="text-right py-2">Avg GPA</th>
                <th className="text-right py-2">Class Avg</th>
              </tr>
            </thead>
            <tbody>
              {easiest.map((c, i) => (
                <tr key={c.code} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-charcoal-600">{i + 1}</td>
                  <td className="py-2 font-semibold">{c.code}</td>
                  <td className="py-2 text-right text-green-400 font-bold tabular-nums">{c.avg_gpa.toFixed(2)}</td>
                  <td className="py-2 text-right text-charcoal-400 tabular-nums">{c.class_avg?.toFixed(1) ?? '—'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-charcoal-600 text-xs mt-8">
        Data sourced from BoilerGrades (GPL v3) · 2021–2025
      </p>
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState('GPA Calculator');
  const [courses, setCourses] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradesLoading, setGradesLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [priorQP, setPriorQP] = useState('');
  const [priorHours, setPriorHours] = useState('');

  useEffect(() => {
    loadHistoricalGrades().then(g => { setGrades(g); setGradesLoading(false); });
  }, []);

  useEffect(() => {
    setCourses(loadSaved());
    const saved = loadCumulative();
    if (saved.priorQP) setPriorQP(saved.priorQP);
    if (saved.priorHours) setPriorHours(saved.priorHours);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(courses)); } catch {}
  }, [courses, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(CUMULATIVE_KEY, JSON.stringify({ priorQP, priorHours })); } catch {}
  }, [priorQP, priorHours, hydrated]);

  const addCourse    = d   => setCourses(p => [...p, { ...d, id: Date.now() }]);
  const updateCourse = (id, u) => setCourses(p => p.map(c => c.id === id ? { ...c, ...u } : c));
  const removeCourse = id  => setCourses(p => p.filter(c => c.id !== id));

  return (
    <main className="min-h-screen pb-12">
      {/* Nav */}
      <nav className="fixed top-0 w-full bg-charcoal-950 border-b border-white/10 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-6">
          <div className="py-4 flex-shrink-0">
            <Logo />
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(t => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-charcoal-800 text-charcoal-200'
                      : 'text-gold-500 hover:text-gold-400'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {tab === 'GPA Calculator' && (
            <span className="ml-auto text-charcoal-500 text-sm">
              {courses.length} course{courses.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </nav>

      {/* Content */}
      <div className="pt-20">
        {tab === 'Spring 2026 Statistics' && (
          gradesLoading
            ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-500" /></div>
            : <StatsTab grades={grades} />
        )}

        {tab === 'GPA Calculator' && (
          <div className="max-w-7xl mx-auto px-4 py-8">
            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-5">Upload a Syllabus or Add a Course</h2>
              <SyllabusUpload onCourseExtracted={addCourse} />
            </section>

            {courses.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-5">Your Courses</h2>
                <div className="space-y-6">
                  {courses.map(course => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      onUpdate={u => updateCourse(course.id, u)}
                      onRemove={() => removeCourse(course.id)}
                      allGrades={gradesLoading ? [] : grades}
                    />
                  ))}
                </div>
              </section>
            )}

            {courses.length === 0 && hydrated && (
              <div className="border border-white/10 p-12 text-center">
                <p className="text-charcoal-400">Upload a syllabus or add a course manually to get started.</p>
              </div>
            )}

            {hydrated && (
              <section className="mt-10">
                <CumulativeSummary
                  courses={courses}
                  allGrades={gradesLoading ? [] : grades}
                  priorQP={priorQP}
                  priorHours={priorHours}
                  onChange={({ priorQP: q, priorHours: h }) => { setPriorQP(q); setPriorHours(h); }}
                />
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
