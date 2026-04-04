/**
 * AddCourseModal — 2-step flow for adding a course
 *
 * Step 1: Pick course — upload PDF syllabus OR search Purdue catalog
 * Step 2: Confirm / edit grading format (categories + weights) before saving
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';

const LOADING_STEPS = [
  { icon: '📄', text: "Reading your syllabus..." },
  { icon: '⚖️', text: 'Extracting grading weights...' },
  { icon: '📊', text: 'Parsing assignment categories...' },
  { icon: '✨', text: 'Almost there...' },
];

const OVERLAY = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const PANEL = {
  initial: { opacity: 0, y: 32, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit: { opacity: 0, y: 16, scale: 0.97 },
};

// ── Step 1 helpers ─────────────────────────────────────────────────────────

function CourseSearch({ searchCourses, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const data = await searchCourses(query);
      setResults(data);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query, searchCourses]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. CS 252, Data Structures, MA 261…"
        className="input-field w-full px-4 py-3 text-sm mb-3"
        autoFocus
      />
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {loading && <p className="text-center text-charcoal-400 text-sm py-4">Searching…</p>}
        {!loading && results.length === 0 && query.length >= 2 && (
          <p className="text-center text-charcoal-500 text-sm py-4">No courses found</p>
        )}
        {results.map((c, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(c)}
            className="w-full text-left px-4 py-3 rounded-xl glass-card glass-card-hover hover:bg-white/5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-gold-500 font-semibold text-sm">
                  {c.Subject} {c.Number}
                </span>
                <p className="text-white text-sm mt-0.5">{c.Title}</p>
                {c.Instructors?.length > 0 && (
                  <p className="text-charcoal-500 text-xs mt-0.5">{c.Instructors.join(', ')}</p>
                )}
              </div>
              <span className="text-charcoal-400 text-xs ml-3 shrink-0">{c.CreditHours || 3} cr</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Category editor ────────────────────────────────────────────────

function CategoryEditor({ categories, onChange }) {
  const totalWeight = categories.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
  const weightOk = Math.abs(totalWeight - 100) < 1;

  const update = (i, field, val) => {
    onChange(categories.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  };

  const add = () => {
    onChange([...categories, { name: '', weight: 0, count: 1, completed: true, entryMode: 'average', score: '', scores: [] }]);
  };

  const remove = (i) => onChange(categories.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-charcoal-400 text-xs font-medium uppercase tracking-wide">Grading Categories</p>
        <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          weightOk ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
        }`}>
          {totalWeight.toFixed(0)}% total
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {categories.map((cat, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={cat.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Category name"
              className="input-field flex-1 px-3 py-2 text-sm"
            />
            <div className="relative w-20">
              <input
                type="number"
                min="0"
                max="100"
                value={cat.weight}
                onChange={(e) => update(i, 'weight', parseFloat(e.target.value) || 0)}
                className="input-field w-full px-2 py-2 text-sm text-center"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-charcoal-500 text-xs pointer-events-none">%</span>
            </div>
            <div className="relative w-16">
              <input
                type="number"
                min="1"
                max="100"
                value={cat.count}
                onChange={(e) => update(i, 'count', parseInt(e.target.value) || 1)}
                title="Number of assignments"
                className="input-field w-full px-2 py-2 text-sm text-center"
              />
            </div>
            <button
              onClick={() => remove(i)}
              disabled={categories.length <= 1}
              className="text-charcoal-600 hover:text-red-400 transition-colors p-1.5 disabled:opacity-30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <div className="text-charcoal-600 text-xs flex gap-2 flex-1">
          <span className="flex-1 text-center">Name</span>
          <span className="w-20 text-center">Weight</span>
          <span className="w-16 text-center"># Items</span>
        </div>
      </div>

      <button
        onClick={add}
        className="w-full py-2.5 rounded-xl border border-dashed border-white/10 text-charcoal-500
                   hover:text-white hover:border-gold-500/30 transition-all text-sm"
      >
        + Add Category
      </button>

      {!weightOk && (
        <p className="text-red-400 text-xs mt-2 text-center">
          Weights must sum to 100% (currently {totalWeight.toFixed(0)}%)
        </p>
      )}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { name: 'Exams', weight: 60, count: 3, completed: true, entryMode: 'average', score: '', scores: [] },
  { name: 'Homework', weight: 30, count: 10, completed: true, entryMode: 'average', score: '', scores: [] },
  { name: 'Other', weight: 10, count: 1, completed: true, entryMode: 'average', score: '', scores: [] },
];

export default function AddCourseModal({ onClose, onSave, parseSyllabus, searchCourses, fetchTemplate, isLoading, error, setError }) {
  const [step, setStep] = useState(1); // 1 = pick course, 2 = edit format
  const [tab, setTab] = useState('search'); // 'search' | 'upload' on step 1
  const [loadingStep, setLoadingStep] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);

  // Course draft
  const [draft, setDraft] = useState({
    course_name: '',
    course_code: '',
    instructor: 'Staff',
    credit_hours: 3,
    grading_scale: { A: 90, B: 80, C: 70, D: 60 },
    categories: DEFAULT_CATEGORIES,
  });

  // Cycle loading animation
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => setLoadingStep((p) => (p + 1) % LOADING_STEPS.length), 1400);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handlePDF = useCallback(async (file) => {
    setError(null);
    const data = await parseSyllabus(file);
    if (!data) return;
    setDraft({
      course_name: data.course_name || '',
      course_code: data.course_code || '',
      instructor: data.instructor || 'Staff',
      credit_hours: data.credit_hours || 3,
      grading_scale: data.grading_scale || { A: 90, B: 80, C: 70, D: 60 },
      categories: (data.categories || DEFAULT_CATEGORIES).map((c) => ({
        ...c,
        completed: true,
        entryMode: 'average',
        score: '',
        scores: [],
      })),
    });
    setStep(2);
  }, [parseSyllabus, setError]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => { if (files[0]) handlePDF(files[0]); },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isLoading,
  });

  const handleSearchSelect = async (course) => {
    setTemplateApplied(false);
    const baseDraft = {
      course_name: `${course.Subject} ${course.Number}${course.Title ? ' — ' + course.Title : ''}`,
      course_code: `${course.Subject}${course.Number}`,
      instructor: course.Instructors?.[0] || 'Staff',
      credit_hours: parseInt(course.CreditHours) || 3,
      grading_scale: { A: 90, B: 80, C: 70, D: 60 },
      categories: DEFAULT_CATEGORIES,
    };
    setDraft(baseDraft);
    setStep(2);

    // Fetch community template in the background and apply if found
    if (fetchTemplate) {
      const template = await fetchTemplate(course.Subject, course.Number);
      if (template?.categories?.length > 0) {
        setDraft((d) => ({
          ...d,
          credit_hours: template.credit_hours || d.credit_hours,
          grading_scale: template.grading_scale || d.grading_scale,
          categories: template.categories.map((c) => ({
            name: c.name || '',
            weight: c.weight ?? 0,
            count: c.count ?? 1,
            completed: true,
            entryMode: 'average',
            score: '',
            scores: [],
            classStats: Array.from({ length: c.count ?? 1 }, () => null),
          })),
        }));
        setTemplateApplied(true);
      }
    }
  };

  const handleSave = () => {
    if (!draft.course_name.trim()) return;
    const totalW = draft.categories.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
    if (Math.abs(totalW - 100) > 1) return;
    onSave(draft);
  };

  return (
    <motion.div
      {...OVERLAY}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        {...PANEL}
        className="glass-card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="text-charcoal-500 hover:text-white transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-white font-bold text-base">
                {step === 1 ? 'Add Course' : 'Grading Format'}
              </h2>
              <p className="text-charcoal-500 text-xs">
                Step {step} of 2 — {step === 1 ? 'find your course' : 'confirm categories & weights'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-charcoal-500 hover:text-white transition-colors p-1.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            {/* ── Step 1 ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {/* Tab switcher */}
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] mb-5">
                  {(['search', 'upload']).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTab(t); setError(null); }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        tab === t
                          ? 'bg-gold-500 text-charcoal-950 font-bold'
                          : 'text-charcoal-400 hover:text-white'
                      }`}
                    >
                      {t === 'search' ? 'Search Course' : 'Upload Syllabus'}
                    </button>
                  ))}
                </div>

                {tab === 'search' && (
                  <CourseSearch searchCourses={searchCourses} onSelect={handleSearchSelect} />
                )}

                {tab === 'upload' && (
                  <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center py-8"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                          className="w-10 h-10 rounded-full border-2 border-charcoal-700 border-t-gold-500 mx-auto mb-4"
                        />
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={loadingStep}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                          >
                            <span className="text-xl">{LOADING_STEPS[loadingStep].icon}</span>
                            <p className="text-white text-sm mt-2">{LOADING_STEPS[loadingStep].text}</p>
                          </motion.div>
                        </AnimatePresence>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="dropzone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        {...getRootProps()}
                      >
                        <motion.div
                          animate={{
                            borderColor: isDragActive ? 'rgba(207,185,145,0.7)' : 'rgba(207,185,145,0.2)',
                            boxShadow: isDragActive ? '0 0 32px rgba(207,185,145,0.15)' : 'none',
                          }}
                          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer"
                        >
                          <input {...getInputProps()} />
                          <div className="w-12 h-12 mx-auto rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-3">
                            <svg className="w-6 h-6 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <p className="text-white font-medium text-sm mb-1">
                            {isDragActive ? 'Drop it!' : 'Drop syllabus PDF here'}
                          </p>
                          <p className="text-charcoal-500 text-xs">or click to browse</p>
                          <p className="text-charcoal-600 text-xs mt-3">Parsed by Gemini AI</p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* Error */}
                {error && (
                  <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                {/* Template banner */}
                {templateApplied && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gold-500/10 border border-gold-500/20"
                  >
                    <svg className="w-3.5 h-3.5 text-gold-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                    </svg>
                    <span className="text-gold-400 text-xs">
                      Community template applied — grading structure from other students' syllabi
                    </span>
                  </motion.div>
                )}

                {/* Course info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-charcoal-500 text-xs block mb-1.5">Course Name</label>
                    <input
                      type="text"
                      value={draft.course_name}
                      onChange={(e) => setDraft((d) => ({ ...d, course_name: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm"
                      placeholder="e.g. CS 252 — Systems Programming"
                    />
                  </div>
                  <div>
                    <label className="text-charcoal-500 text-xs block mb-1.5">Course Code</label>
                    <input
                      type="text"
                      value={draft.course_code}
                      onChange={(e) => setDraft((d) => ({ ...d, course_code: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm"
                      placeholder="CS25200"
                    />
                  </div>
                  <div>
                    <label className="text-charcoal-500 text-xs block mb-1.5">Credit Hours</label>
                    <input
                      type="number"
                      min="1" max="6"
                      value={draft.credit_hours}
                      onChange={(e) => setDraft((d) => ({ ...d, credit_hours: parseInt(e.target.value) || 3 }))}
                      className="input-field w-full px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-charcoal-500 text-xs block mb-1.5">Instructor</label>
                    <input
                      type="text"
                      value={draft.instructor}
                      onChange={(e) => setDraft((d) => ({ ...d, instructor: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm"
                      placeholder="Prof. Last Name"
                    />
                  </div>
                </div>

                {/* Category editor */}
                <CategoryEditor
                  categories={draft.categories}
                  onChange={(cats) => setDraft((d) => ({ ...d, categories: cats }))}
                />

                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={!draft.course_name.trim()}
                  className="gold-btn w-full py-3.5 text-sm font-bold disabled:opacity-40"
                >
                  Add to Dashboard
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
