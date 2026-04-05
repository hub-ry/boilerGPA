/**
 * AddCourseModal — add courses via search, community templates, single PDF, or bulk PDF drop
 *
 * Step 1: find course (search / upload)
 * Step 2: confirm / edit grading format
 *
 * Bulk drop: multiple PDFs → parsed & auto-added without step 2
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';

const API_BASE = 'http://localhost:8000';

const LOADING_STEPS = [
  { icon: '📄', text: "Reading your syllabus..." },
  { icon: '⚖️', text: 'Extracting grading weights...' },
  { icon: '📊', text: 'Parsing assignment categories...' },
  { icon: '✨', text: 'Almost there...' },
];

const OVERLAY = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const PANEL = {
  initial: { opacity: 0, y: 32, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit: { opacity: 0, y: 16, scale: 0.97 },
};

const DEFAULT_CATEGORIES = [
  { name: 'Exams', weight: 60, count: 3, completed: true, entryMode: 'average', score: '', scores: [] },
  { name: 'Homework', weight: 30, count: 10, completed: true, entryMode: 'average', score: '', scores: [] },
  { name: 'Other', weight: 10, count: 1, completed: true, entryMode: 'average', score: '', scores: [] },
];

function categoriesToDraft(categories) {
  return (categories?.length ? categories : DEFAULT_CATEGORIES).map((c) => ({
    ...c,
    completed: true,
    entryMode: 'average',
    score: '',
    scores: [],
  }));
}

// ── Star button with optimistic update ───────────────────────────────────────

function StarButton({ templateId, initialStars }) {
  const [stars, setStars] = useState(initialStars);
  const [starred, setStarred] = useState(false);

  const handleStar = async (e) => {
    e.stopPropagation();
    if (starred) return;
    setStarred(true);
    setStars((s) => s + 1);
    try {
      await fetch(`${API_BASE}/community/star/${templateId}`, { method: 'POST' });
    } catch { /* optimistic only */ }
  };

  return (
    <button
      onClick={handleStar}
      title={starred ? 'Starred!' : 'Star this template'}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
        starred
          ? 'bg-gold-500/20 text-gold-400'
          : 'bg-white/[0.04] text-charcoal-500 hover:text-gold-400 hover:bg-gold-500/10'
      }`}
    >
      <svg className="w-3 h-3" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
      {stars}
    </button>
  );
}

// ── Community template card ───────────────────────────────────────────────────

function CommunityTemplateCard({ template, onUse }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-3 rounded-xl border border-gold-500/20 bg-gold-500/5 hover:bg-gold-500/8 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {template.semester && (
              <span className="text-[10px] bg-gold-500/20 text-gold-400 px-1.5 py-0.5 rounded font-medium shrink-0">
                {template.semester}
              </span>
            )}
            {template.instructor && template.instructor !== 'Staff' && (
              <span className="text-charcoal-500 text-xs truncate">{template.instructor}</span>
            )}
            {!template.semester && !template.instructor && (
              <span className="text-charcoal-600 text-xs">Anonymous submission</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {template.categories.slice(0, 4).map((c, i) => (
              <span key={i} className="text-[10px] text-charcoal-400 bg-white/[0.04] px-1.5 py-0.5 rounded">
                {c.name} {c.weight}%
              </span>
            ))}
            {template.categories.length > 4 && (
              <span className="text-[10px] text-charcoal-600">+{template.categories.length - 4} more</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StarButton templateId={template.id} initialStars={template.stars} />
          <button
            onClick={() => onUse(template)}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-gold-500/15 text-gold-400 hover:bg-gold-500/25 transition-all"
          >
            Use
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Course search with community templates ───────────────────────────────────

function CourseSearch({ searchCourses, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [communityTemplates, setCommunityTemplates] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);

  useEffect(() => {
    setCommunityTemplates([]);
    if (query.length < 2) { setResults([]); return; }

    const t = setTimeout(async () => {
      setLoading(true);
      const data = await searchCourses(query);
      setResults(data);
      setLoading(false);

      // Fetch community templates if query looks like an exact course code
      const m = query.trim().replace(/\s+/g, '').match(/^([A-Za-z]{2,4})(\d{3,5})$/);
      if (m) {
        setCommunityLoading(true);
        try {
          const resp = await fetch(`${API_BASE}/community/templates/${m[1].toUpperCase()}${m[2]}`);
          const json = await resp.json();
          if (json.templates?.length > 0) setCommunityTemplates(json.templates);
        } catch { /* silent */ }
        setCommunityLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, searchCourses]);

  const handleUseTemplate = (template) => {
    onSelect({
      Subject: template.subject,
      Number: template.number,
      Title: template.course_name || '',
      CreditHours: template.credit_hours || 3,
      Instructors: template.instructor ? [template.instructor] : [],
      _template: {
        categories: template.categories,
        credit_hours: template.credit_hours,
        grading_scale: template.grading_scale,
      },
    });
  };

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

      <div className="space-y-3 max-h-72 overflow-y-auto">
        {/* Community templates */}
        {communityLoading && (
          <div className="flex items-center gap-2 px-4 py-2">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-3 h-3 rounded-full border border-charcoal-700 border-t-gold-500 shrink-0" />
            <span className="text-charcoal-600 text-xs">Checking community templates…</span>
          </div>
        )}

        {communityTemplates.length > 0 && (
          <div>
            <p className="text-charcoal-500 text-[10px] uppercase tracking-wide font-medium mb-1.5 px-1">
              Community Templates · {communityTemplates.length} submission{communityTemplates.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1.5">
              {communityTemplates.map((t) => (
                <CommunityTemplateCard key={t.id} template={t} onUse={handleUseTemplate} />
              ))}
            </div>
            <div className="border-t border-white/[0.06] my-3" />
          </div>
        )}

        {/* Catalog results */}
        {loading && <p className="text-center text-charcoal-400 text-sm py-4">Searching…</p>}
        {!loading && results.length === 0 && query.length >= 2 && communityTemplates.length === 0 && (
          <p className="text-center text-charcoal-500 text-sm py-4">No courses found</p>
        )}
        {results.length > 0 && (
          <div>
            {communityTemplates.length > 0 && (
              <p className="text-charcoal-500 text-[10px] uppercase tracking-wide font-medium mb-1.5 px-1">Purdue Catalog</p>
            )}
            <div className="space-y-1.5">
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
                      <span className="text-gold-500 font-semibold text-sm">{c.Subject} {c.Number}</span>
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
        )}
      </div>
    </div>
  );
}

// ── Category editor ─────────────────────────────────────────────────────────

function CategoryEditor({ categories, onChange }) {
  const totalWeight = categories.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
  const weightOk = Math.abs(totalWeight - 100) < 1;
  const update = (i, field, val) => onChange(categories.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const add = () => onChange([...categories, { name: '', weight: 0, count: 1, completed: true, entryMode: 'average', score: '', scores: [] }]);
  const remove = (i) => onChange(categories.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-charcoal-400 text-xs font-medium uppercase tracking-wide">Grading Categories</p>
        <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${weightOk ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
          {totalWeight.toFixed(0)}% total
        </div>
      </div>
      <div className="space-y-2 mb-3">
        {categories.map((cat, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="text" value={cat.name} onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Category name" className="input-field flex-1 px-3 py-2 text-sm" />
            <div className="relative w-20">
              <input type="number" min="0" max="100" value={cat.weight}
                onChange={(e) => update(i, 'weight', parseFloat(e.target.value) || 0)}
                className="input-field w-full px-2 py-2 text-sm text-center" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-charcoal-500 text-xs pointer-events-none">%</span>
            </div>
            <div className="relative w-16">
              <input type="number" min="1" max="100" value={cat.count}
                onChange={(e) => update(i, 'count', parseInt(e.target.value) || 1)}
                title="Number of assignments" className="input-field w-full px-2 py-2 text-sm text-center" />
            </div>
            <button onClick={() => remove(i)} disabled={categories.length <= 1}
              className="text-charcoal-600 hover:text-red-400 transition-colors p-1.5 disabled:opacity-30">
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
      <button onClick={add}
        className="w-full py-2.5 rounded-xl border border-dashed border-white/10 text-charcoal-500 hover:text-white hover:border-gold-500/30 transition-all text-sm">
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

// ── Bulk upload status list ──────────────────────────────────────────────────

const STATUS_ICON = {
  pending:  <div className="w-4 h-4 rounded-full border border-charcoal-600" />,
  parsing:  (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className="w-4 h-4 rounded-full border-2 border-charcoal-700 border-t-gold-500" />
  ),
  done:     <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  error:    <svg className="w-4 h-4 text-charcoal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

// ── Main modal ───────────────────────────────────────────────────────────────

export default function AddCourseModal({ onClose, onSave, onSaveBulk, parseSyllabus, searchCourses, fetchTemplate, isLoading, error, setError }) {
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState('search');
  const [loadingStep, setLoadingStep] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState(null);

  // Bulk upload state
  const [bulkFiles, setBulkFiles] = useState(null);
  const [bulkStatuses, setBulkStatuses] = useState([]);
  const [bulkDone, setBulkDone] = useState(false);

  const [draft, setDraft] = useState({
    course_name: '', course_code: '', instructor: 'Staff',
    credit_hours: 3, grading_scale: { A: 90, B: 80, C: 70, D: 60 },
    categories: DEFAULT_CATEGORIES,
  });

  // Loading animation
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => setLoadingStep((p) => (p + 1) % LOADING_STEPS.length), 1400);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Single PDF handler → step 2
  const handleSinglePDF = useCallback(async (file) => {
    setError(null);
    setParseWarnings([]);
    const { data, partial } = await parseSyllabus(file);
    const warnings = [];
    if (partial) warnings.push("Couldn't auto-read your syllabus — please fill in the details below.");
    else {
      if (data.warnings?.length) warnings.push(...data.warnings);
      if (data.parsing_confidence === 'low' && !warnings.length)
        warnings.push("Some details may be missing — please verify.");
    }
    setParseWarnings(warnings);
    setDraft({
      course_name: data.course_name || '',
      course_code: data.course_code || '',
      instructor: data.instructor || 'Staff',
      credit_hours: data.credit_hours || 3,
      grading_scale: data.grading_scale || { A: 90, B: 80, C: 70, D: 60 },
      categories: categoriesToDraft(data.categories),
    });
    setStep(2);
  }, [parseSyllabus, setError]);

  // Bulk PDF handler — parse all files, auto-add, no step 2
  const handleBulkPDFs = useCallback(async (files) => {
    setBulkFiles(files);
    setBulkDone(false);
    const statuses = files.map((f) => ({ name: f.name, status: 'pending', courseName: '' }));
    setBulkStatuses(statuses);

    const parsed = [];
    for (let i = 0; i < files.length; i++) {
      setBulkStatuses((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'parsing' } : s));
      try {
        const formData = new FormData();
        formData.append('file', files[i]);
        const resp = await fetch(`${API_BASE}/parse-syllabus`, { method: 'POST', body: formData });
        const json = await resp.json().catch(() => ({}));
        const data = json.data || {};
        const courseData = {
          course_name: data.course_name || files[i].name.replace('.pdf', ''),
          course_code: data.course_code || '',
          instructor: data.instructor || 'Staff',
          credit_hours: data.credit_hours || 3,
          grading_scale: data.grading_scale || { A: 90, B: 80, C: 70, D: 60 },
          categories: categoriesToDraft(data.categories),
        };
        parsed.push(courseData);
        setBulkStatuses((prev) => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'done', courseName: courseData.course_name || files[i].name } : s
        ));
      } catch {
        setBulkStatuses((prev) => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'error', courseName: files[i].name } : s
        ));
      }
    }

    if (parsed.length > 0) onSaveBulk(parsed);
    setBulkDone(true);
  }, [onSaveBulk]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => {
      if (!files.length) return;
      if (files.length === 1) handleSinglePDF(files[0]);
      else handleBulkPDFs(files);
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    accept: { 'application/pdf': ['.pdf'] },
    disabled: isLoading || !!bulkFiles,
  });

  const handleSearchSelect = async (course) => {
    setTemplateApplied(false);
    const prebuiltTemplate = course._template;
    const baseDraft = {
      course_name: `${course.Subject} ${course.Number}${course.Title ? ' — ' + course.Title : ''}`,
      course_code: `${course.Subject}${course.Number}`,
      instructor: course.Instructors?.[0] || 'Staff',
      credit_hours: parseInt(course.CreditHours) || 3,
      grading_scale: { A: 90, B: 80, C: 70, D: 60 },
      categories: DEFAULT_CATEGORIES,
    };

    if (prebuiltTemplate?.categories?.length > 0) {
      setDraft({
        ...baseDraft,
        credit_hours: prebuiltTemplate.credit_hours || baseDraft.credit_hours,
        grading_scale: prebuiltTemplate.grading_scale || baseDraft.grading_scale,
        categories: categoriesToDraft(prebuiltTemplate.categories),
      });
      setTemplateApplied(true);
      setStep(2);
      return;
    }

    setDraft(baseDraft);
    setStep(2);

    // Fetch old-style canonical template in background as fallback
    if (fetchTemplate) {
      const template = await fetchTemplate(course.Subject, course.Number);
      if (template?.categories?.length > 0) {
        setDraft((d) => ({
          ...d,
          credit_hours: template.credit_hours || d.credit_hours,
          grading_scale: template.grading_scale || d.grading_scale,
          categories: template.categories.map((c) => ({
            name: c.name || '', weight: c.weight ?? 0, count: c.count ?? 1,
            completed: true, entryMode: 'average', score: '', scores: [],
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
    <motion.div {...OVERLAY}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div {...PANEL}
        className="glass-card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="text-charcoal-500 hover:text-white transition-colors p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-white font-bold text-base">
                {bulkFiles ? 'Adding Courses' : step === 1 ? 'Add Course' : 'Grading Format'}
              </h2>
              <p className="text-charcoal-500 text-xs">
                {bulkFiles
                  ? `${bulkStatuses.filter(s => s.status === 'done').length} of ${bulkFiles.length} processed`
                  : `Step ${step} of 2 — ${step === 1 ? 'find your course' : 'confirm categories & weights'}`}
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

            {/* ── Bulk progress view ── */}
            {bulkFiles && (
              <motion.div key="bulk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-2 mb-4">
                  {bulkStatuses.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <div className="shrink-0">{STATUS_ICON[s.status]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{s.courseName || s.name}</p>
                        <p className="text-charcoal-600 text-xs">{s.name}</p>
                      </div>
                      <span className={`text-xs shrink-0 ${
                        s.status === 'done' ? 'text-green-400' :
                        s.status === 'error' ? 'text-charcoal-500' :
                        s.status === 'parsing' ? 'text-gold-500' : 'text-charcoal-600'
                      }`}>
                        {s.status === 'parsing' ? 'parsing…' : s.status === 'done' ? 'added' : s.status === 'error' ? 'skipped' : 'waiting'}
                      </span>
                    </div>
                  ))}
                </div>
                {bulkDone && (
                  <motion.button
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    onClick={onClose}
                    className="gold-btn w-full py-3 text-sm font-bold"
                  >
                    Done — {bulkStatuses.filter(s => s.status === 'done').length} courses added
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* ── Step 1 ── */}
            {!bulkFiles && step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] mb-5">
                  {(['search', 'string', 'upload']).map((t) => (
                    <button key={t} onClick={() => { setTab(t); setError(null); setPasteError(null); }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        tab === t ? 'bg-gold-500 text-charcoal-950 font-bold' : 'text-charcoal-400 hover:text-white'
                      }`}>
                      {t === 'search' ? 'Search' : t === 'string' ? 'Paste String' : 'Syllabus'}
                    </button>
                  ))}
                </div>

                {tab === 'search' && (
                  <CourseSearch searchCourses={searchCourses} onSelect={handleSearchSelect} />
                )}

                {tab === 'string' && (
                  <div className="space-y-3">
                    <p className="text-charcoal-400 text-xs">
                      Paste a course string shared by a classmate to instantly load their grading setup.
                    </p>
                    <textarea
                      value={pasteValue}
                      onChange={(e) => { setPasteValue(e.target.value); setPasteError(null); }}
                      placeholder="bgpa_course_v1_…"
                      rows={4}
                      className="input-field w-full px-3 py-2.5 text-xs font-mono resize-none"
                      autoFocus
                    />
                    {pasteError && (
                      <p className="text-red-400 text-xs px-1">{pasteError}</p>
                    )}
                    <button
                      disabled={!pasteValue.trim()}
                      onClick={() => {
                        try {
                          const raw = pasteValue.trim();
                          if (!raw.startsWith('bgpa_course_v1_')) throw new Error('Not a valid course string');
                          const json = JSON.parse(decodeURIComponent(atob(raw.slice('bgpa_course_v1_'.length))));
                          if (!json.categories?.length) throw new Error('No categories found in string');
                          handleSearchSelect({
                            Subject: json.course_code?.match(/^([A-Za-z]+)/)?.[1] || 'XX',
                            Number: json.course_code?.match(/(\d+)/)?.[1] || '000',
                            Title: json.course_name || '',
                            CreditHours: json.credit_hours || 3,
                            Instructors: json.instructor ? [json.instructor] : [],
                            _template: {
                              categories: json.categories,
                              credit_hours: json.credit_hours,
                              grading_scale: json.grading_scale,
                            },
                          });
                        } catch (e) {
                          setPasteError(e.message || 'Invalid string');
                        }
                      }}
                      className="gold-btn w-full py-3 text-sm font-bold disabled:opacity-40"
                    >
                      Load Course
                    </button>
                  </div>
                )}

                {tab === 'upload' && (
                  <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                          className="w-10 h-10 rounded-full border-2 border-charcoal-700 border-t-gold-500 mx-auto mb-4" />
                        <AnimatePresence mode="wait">
                          <motion.div key={loadingStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                            <span className="text-xl">{LOADING_STEPS[loadingStep].icon}</span>
                            <p className="text-white text-sm mt-2">{LOADING_STEPS[loadingStep].text}</p>
                          </motion.div>
                        </AnimatePresence>
                      </motion.div>
                    ) : (
                      <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} {...getRootProps()}>
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
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <p className="text-white font-medium text-sm mb-1">
                            {isDragActive ? 'Drop them!' : 'Drop syllabus PDFs here'}
                          </p>
                          <p className="text-charcoal-500 text-xs mb-1">or click to browse</p>
                          <p className="text-charcoal-600 text-xs">
                            Drop one to review, or multiple to bulk-add all at once
                          </p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </motion.div>
            )}

            {/* ── Step 2 ── */}
            {!bulkFiles && step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">

                {/* Parse warning */}
                {parseWarnings.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <svg className="w-3.5 h-3.5 text-charcoal-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="space-y-0.5">
                      {parseWarnings.map((w, i) => <p key={i} className="text-charcoal-400 text-xs">{w}</p>)}
                    </div>
                  </motion.div>
                )}

                {/* Template banner */}
                {templateApplied && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gold-500/10 border border-gold-500/20">
                    <svg className="w-3.5 h-3.5 text-gold-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                    </svg>
                    <span className="text-gold-400 text-xs">Community template applied — grading structure from other students</span>
                  </motion.div>
                )}

                {/* Course info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-charcoal-500 text-xs block mb-1.5">Course Name</label>
                    <input type="text" value={draft.course_name}
                      onChange={(e) => setDraft((d) => ({ ...d, course_name: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm" placeholder="e.g. CS 252 — Systems Programming" />
                  </div>
                  <div>
                    <label className="text-charcoal-500 text-xs block mb-1.5">Course Code</label>
                    <input type="text" value={draft.course_code}
                      onChange={(e) => setDraft((d) => ({ ...d, course_code: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm" placeholder="CS25200" />
                  </div>
                  <div>
                    <label className="text-charcoal-500 text-xs block mb-1.5">Credit Hours</label>
                    <input type="number" min="1" max="6" value={draft.credit_hours}
                      onChange={(e) => setDraft((d) => ({ ...d, credit_hours: parseInt(e.target.value) || 3 }))}
                      className="input-field w-full px-3 py-2.5 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-charcoal-500 text-xs block mb-1.5">Instructor</label>
                    <input type="text" value={draft.instructor}
                      onChange={(e) => setDraft((d) => ({ ...d, instructor: e.target.value }))}
                      className="input-field w-full px-3 py-2.5 text-sm" placeholder="Prof. Last Name" />
                  </div>
                </div>

                <CategoryEditor categories={draft.categories} onChange={(cats) => setDraft((d) => ({ ...d, categories: cats }))} />

                <button onClick={handleSave} disabled={!draft.course_name.trim()}
                  className="gold-btn w-full py-3.5 text-sm font-bold disabled:opacity-40">
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
