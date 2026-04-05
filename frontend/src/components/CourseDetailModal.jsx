/**
 * CourseDetailModal — full course view with per-assignment drill-down
 *
 * Each category row has two modes:
 *   average   — one input field for the overall average score
 *   individual — expands to N inputs (one per assignment), average auto-computed
 *
 * The chevron on the right of each category row toggles between modes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { calcLocalGPA, effectiveScore, enteredAverage, pctToLetter, SEMESTER_OPTIONS } from '../hooks/useDashboard';

const OVERLAY = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
const PANEL = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 28 } },
  exit: { opacity: 0, y: 24 },
};

const CAT_COLORS = ['bg-gold-500', 'bg-gold-300', 'bg-gold-700', 'bg-charcoal-400', 'bg-charcoal-300', 'bg-charcoal-500'];

// ── NumericInput — allows fully clearing the field while typing ─────────────
// Holds a local string draft; only commits the parsed value on blur/Enter.
function NumericInput({ value, onChange, min, max, step, placeholder, className, title }) {
  const [draft, setDraft] = useState(String(value ?? ''));

  // Keep draft in sync when value is updated externally
  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);

  const commit = (raw) => {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clamped = min !== undefined && parsed < min ? min
                    : max !== undefined && parsed > max ? max
                    : parsed;
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      // Empty or invalid — revert to current value
      setDraft(String(value ?? ''));
    }
  };

  return (
    <input
      type="number"
      min={min} max={max} step={step}
      value={draft}
      placeholder={placeholder}
      title={title}
      className={className}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
    />
  );
}

// ── Weight bar ─────────────────────────────────────────────────────────────

function WeightBar({ categories }) {
  return (
    <div className="mb-5">
      <div className="h-1.5 rounded-full overflow-hidden flex gap-px mb-2">
        {categories.map((cat, i) => (
          <div key={i} style={{ width: `${cat.weight}%` }} className={`${CAT_COLORS[i % CAT_COLORS.length]} h-full`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((cat, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${CAT_COLORS[i % CAT_COLORS.length]}`} />
            <span className="text-charcoal-400 text-xs">
              {cat.name || 'Unnamed'} <span className="text-charcoal-300">{cat.weight}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Individual assignment inputs ────────────────────────────────────────────

function AssignmentGrid({ category, catIdx, courseId, onUpdate }) {
  const count = category.count || 1;
  const scores = category.scores.length === count
    ? category.scores
    : Array(count).fill('');

  const filled = scores.map(parseFloat).filter((n) => !isNaN(n));
  const avg = filled.length > 0
    ? (filled.reduce((a, b) => a + b, 0) / filled.length)
    : null;
  const autoFill = avg !== null ? avg.toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeInOut' }}
      style={{ overflow: 'hidden' }}
    >
      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mb-2">
          {scores.map((s, idx) => {
            const isEmpty = s === '' || s === null || s === undefined;
            const isAutoFilled = isEmpty && autoFill !== null;
            return (
              <div key={idx} className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={s}
                  onChange={(e) => onUpdate(catIdx, idx, e.target.value)}
                  placeholder={autoFill ?? '—'}
                  className={`input-field w-full px-2 py-2 text-xs text-center transition-opacity ${
                    isAutoFilled ? 'placeholder-charcoal-500/60' : ''
                  }`}
                />
                {/* Auto-fill ghost value */}
                {isAutoFilled && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-charcoal-500/50 pointer-events-none select-none">
                    {autoFill}
                  </span>
                )}
                <span className="absolute -top-1.5 left-1 text-charcoal-600 text-[9px] leading-none">
                  {idx + 1}
                </span>
              </div>
            );
          })}
        </div>
        {avg !== null && (
          <p className="text-xs text-charcoal-400 flex items-center gap-1.5">
            Average: <span className="text-white font-semibold">{avg.toFixed(1)}%</span>
            <span className="text-charcoal-600">({filled.length}/{count} entered)</span>
            {filled.length < count && (
              <span className="text-charcoal-600/70 italic">· {count - filled.length} missing filled with avg</span>
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Community stats panel ──────────────────────────────────────────────────

const STATS_FIELDS = [
  { key: 'mean',   label: 'Mean' },
  { key: 'median', label: 'Median' },
  { key: 'std_dev', label: 'Std Dev' },
  { key: 'min_score', label: 'Min' },
  { key: 'max_score', label: 'Max' },
];

// communityStats: array of {mean, median, std_dev, min_score, max_score, report_count} per item
function CommunityStatsPanel({ category, courseCode, semester, communityStats, onRefresh }) {
  const count = category.count || 1;
  const base = (category.name || 'Item').replace(/s$/i, '').trim();

  // reportForm: null | { itemIdx, values: {mean,median,std_dev,min_score,max_score} }
  const [reportForm, setReportForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const openReport = (itemIdx) => {
    setSubmitted(false);
    setReportForm({
      itemIdx,
      values: { mean: '', median: '', std_dev: '', min_score: '', max_score: '' },
    });
  };

  const handleSubmit = async () => {
    if (!reportForm) return;
    setSubmitting(true);
    try {
      await fetch('http://localhost:8000/class-stats/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_code: courseCode,
          semester: semester || '',
          items: [{
            category_name: category.name,
            item_index: reportForm.itemIdx,
            mean:      reportForm.values.mean      !== '' ? parseFloat(reportForm.values.mean)      : null,
            median:    reportForm.values.median    !== '' ? parseFloat(reportForm.values.median)    : null,
            std_dev:   reportForm.values.std_dev   !== '' ? parseFloat(reportForm.values.std_dev)   : null,
            min_score: reportForm.values.min_score !== '' ? parseFloat(reportForm.values.min_score) : null,
            max_score: reportForm.values.max_score !== '' ? parseFloat(reportForm.values.max_score) : null,
          }],
        }),
      });
      setSubmitted(true);
      setReportForm(null);
      onRefresh();
    } catch { /* silent */ }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{ overflow: 'hidden' }}
    >
      <div className="px-3.5 pb-3.5 pt-2 border-t border-white/[0.05] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-charcoal-600 text-xs">Community-reported class statistics</p>
          {submitted && <span className="text-green-400 text-xs">✓ Reported!</span>}
        </div>

        {Array.from({ length: count }, (_, itemIdx) => {
          const stats = communityStats?.[itemIdx];
          const label = count === 1 ? category.name : `${base} ${itemIdx + 1}`;
          const isReporting = reportForm?.itemIdx === itemIdx;

          return (
            <div key={itemIdx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-charcoal-500 text-xs font-medium">{label}</span>
                {!isReporting && (
                  <button
                    onClick={() => openReport(itemIdx)}
                    className="text-[10px] text-gold-500/70 hover:text-gold-400 transition-colors"
                  >
                    + Report stats
                  </button>
                )}
              </div>

              {/* Community stats display */}
              {stats ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {STATS_FIELDS.map(({ key, label: fieldLabel }) => (
                    <div key={key} className="text-center">
                      <p className="text-charcoal-700 text-[9px] mb-0.5">{fieldLabel}</p>
                      <p className="text-charcoal-300 text-xs font-medium">
                        {stats[key] != null ? stats[key].toFixed(1) : '—'}
                      </p>
                    </div>
                  ))}
                  <p className="col-span-5 text-charcoal-700 text-[9px] text-right">
                    {stats.report_count} report{stats.report_count !== 1 ? 's' : ''}
                  </p>
                </div>
              ) : (
                <p className="text-charcoal-700 text-xs">No community stats yet — be the first to report!</p>
              )}

              {/* Report form */}
              {isReporting && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="grid grid-cols-5 gap-1.5">
                    {STATS_FIELDS.map(({ key, label: fieldLabel }) => (
                      <div key={key}>
                        <p className="text-charcoal-600 text-[9px] text-center mb-1">{fieldLabel}</p>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={reportForm.values[key]}
                          onChange={(e) =>
                            setReportForm((f) => ({ ...f, values: { ...f.values, [key]: e.target.value } }))
                          }
                          placeholder="—"
                          className="input-field w-full px-1 py-1.5 text-xs text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="gold-btn flex-1 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      {submitting ? 'Submitting…' : 'Submit Report'}
                    </button>
                    <button
                      onClick={() => setReportForm(null)}
                      className="px-3 py-1.5 rounded-lg text-xs text-charcoal-500 hover:text-white bg-white/[0.04] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Single category row ────────────────────────────────────────────────────

function CategoryRow({ category, catIdx, course, onUpdate, onUpdateAssignment, onToggleMode, onRemove, colorClass, isOnly, dragHandleProps, communityStats, onRefreshStats }) {
  const [showStats, setShowStats] = useState(false);
  const hasStats = Array.isArray(communityStats) && communityStats.length > 0;
  const score = effectiveScore(category);
  const isExpanded = category.entryMode === 'individual';
  const canExpand = (category.count || 1) > 1;

  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      category.completed ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-white/[0.01] border-white/[0.03]'
    }`}>
      <div className="flex items-center gap-3 p-3.5">
        {/* Drag handle */}
        <button
          {...dragHandleProps}
          className="text-charcoal-700 hover:text-charcoal-400 cursor-grab active:cursor-grabbing p-0.5 shrink-0 touch-none transition-colors"
          tabIndex={-1}
          title="Drag to reorder"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
        </button>

        {/* Color dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} />

        {/* Category info — all editable inline */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <input
            type="text"
            value={category.name}
            onChange={(e) => onUpdate(catIdx, { name: e.target.value })}
            placeholder="Name"
            className="input-field flex-1 min-w-0 px-2 py-1.5 text-sm font-medium"
          />
          <div className="relative shrink-0">
            <NumericInput
              min={0} max={100} step={1}
              value={category.weight}
              onChange={(v) => onUpdate(catIdx, { weight: v })}
              placeholder="0"
              className="input-field w-14 px-2 py-1.5 text-xs text-center"
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-charcoal-600 text-[10px] pointer-events-none">%</span>
          </div>
          <div className="relative shrink-0">
            <NumericInput
              min={1} max={100} step={1}
              value={category.count}
              onChange={(v) => onUpdate(catIdx, { count: Math.round(v) })}
              title="Number of items"
              className="input-field w-12 px-1.5 py-1.5 text-xs text-center"
            />
            <span className="absolute -bottom-3.5 left-0 right-0 text-charcoal-700 text-[9px] text-center pointer-events-none">items</span>
          </div>
        </div>

        {/* Score: show avg if individual mode, else single input */}
        <div className="flex items-center gap-2 shrink-0">
          {isExpanded ? (
            <span className={`text-sm font-semibold w-14 text-center ${
              score !== null ? 'text-white' : 'text-charcoal-600'
            }`}>
              {score !== null ? `${score.toFixed(1)}%` : '—'}
            </span>
          ) : (
            <div className="relative">
              <input
                type="number"
                min="0" max="100" step="0.1"
                value={category.score}
                onChange={(e) => onUpdate(catIdx, { score: e.target.value })}
                disabled={!category.completed}
                placeholder="—"
                className={`input-field w-20 px-3 py-2 text-sm text-center ${
                  !category.completed ? 'opacity-30 cursor-not-allowed' : ''
                }`}
              />
              {category.completed && category.score !== '' && (
                <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-charcoal-500 text-xs">%</span>
              )}
            </div>
          )}

          {/* Completed toggle */}
          <div
            onClick={() => onUpdate(catIdx, { completed: !category.completed })}
            className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${
              category.completed ? 'bg-gold-500/30' : 'bg-charcoal-700'
            }`}
          >
            <motion.div
              animate={{ x: category.completed ? 16 : 2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`absolute top-0.5 w-4 h-4 rounded-full ${
                category.completed ? 'bg-gold-500' : 'bg-charcoal-500'
              }`}
            />
          </div>

          {/* Drill-down chevron (only for multi-item categories) */}
          {canExpand && (
            <button
              onClick={() => onToggleMode(catIdx)}
              title={isExpanded ? 'Switch to average entry' : `Enter ${category.count} scores individually`}
              className={`p-1.5 rounded-lg transition-all ${
                isExpanded
                  ? 'text-gold-500 bg-gold-500/10'
                  : 'text-charcoal-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <motion.svg
                animate={{ rotate: isExpanded ? 180 : 0 }}
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </motion.svg>
            </button>
          )}

          {/* Class stats toggle */}
          <button
            onClick={() => setShowStats((s) => !s)}
            title="Enter class statistics (mean, std dev, etc.)"
            className={`p-1.5 rounded-lg transition-all text-xs font-bold ${
              hasStats
                ? 'text-gold-500 bg-gold-500/10'
                : showStats
                ? 'text-charcoal-300 bg-white/5'
                : 'text-charcoal-600 hover:text-charcoal-300 hover:bg-white/5'
            }`}
          >
            σ
          </button>

          {/* Remove */}
          {!isOnly && (
            <button
              onClick={() => onRemove(catIdx)}
              className="text-charcoal-700 hover:text-red-400 transition-colors p-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Individual assignment grid */}
      <AnimatePresence>
        {isExpanded && (
          <div className="px-3.5 pb-3.5">
            <AssignmentGrid
              category={category}
              catIdx={catIdx}
              courseId={course.id}
              onUpdate={onUpdateAssignment}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Community stats panel */}
      <AnimatePresence>
        {showStats && (
          <CommunityStatsPanel
            category={category}
            courseCode={course.course_code}
            semester={course.semester || ''}
            communityStats={communityStats}
            onRefresh={onRefreshStats}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableCategoryRow({ sortId, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : 'auto',
        position: 'relative',
      }}
    >
      <CategoryRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export default function CourseDetailModal({
  course,
  onClose,
  onUpdate,
  onUpdateCategory,
  onUpdateAssignment,
  onToggleEntryMode,
  onAddCategory,
  onRemoveCategory,
  onRemoveCourse,
  onReorderCategories,
  activeSemester,
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [shareStatus, setShareStatus] = useState(null); // null | 'sharing' | 'done' | 'error'
  const [allCommunityStats, setAllCommunityStats] = useState({});

  const fetchCommunityStats = useCallback(async () => {
    if (!course.course_code) return;
    try {
      const resp = await fetch(`http://localhost:8000/class-stats/${course.course_code}`);
      const json = await resp.json();
      if (json.stats) setAllCommunityStats(json.stats);
    } catch { /* silent */ }
  }, [course.course_code]);

  useEffect(() => { fetchCommunityStats(); }, [fetchCommunityStats]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = parseInt(active.id, 10);
    const newIndex = parseInt(over.id, 10);
    onReorderCategories(oldIndex, newIndex);
  };

  const { gpa, letter, weightedScore, completedWeight, isIncomplete } = calcLocalGPA(course);
  const scale = { A: 90, B: 80, C: 70, D: 60, ...course.grading_scale };
  const totalCatWeight = course.categories.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
  const weightOk = Math.abs(totalCatWeight - 100) < 1;

  const letterColor = (l) => {
    if (!l || l === '—') return 'text-charcoal-400';
    if (l.startsWith('A')) return 'text-green-400';
    if (l.startsWith('B')) return 'text-gold-500';
    if (l.startsWith('C')) return 'text-yellow-500';
    return 'text-red-400';
  };

  return (
    <motion.div
      {...OVERLAY}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        {...PANEL}
        className="glass-card w-full sm:max-w-xl max-h-[95vh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-white/[0.06]">
          <div className="flex-1 min-w-0 mr-3">
            {editingHeader ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={course.course_name}
                  onChange={(e) => onUpdate({ course_name: e.target.value })}
                  className="input-field w-full px-3 py-2 text-sm font-semibold"
                  placeholder="Course name"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={course.course_code}
                    onChange={(e) => onUpdate({ course_code: e.target.value })}
                    className="input-field px-3 py-2 text-xs"
                    placeholder="CS25200"
                  />
                  <input
                    type="text"
                    value={course.instructor}
                    onChange={(e) => onUpdate({ instructor: e.target.value })}
                    className="input-field px-3 py-2 text-xs"
                    placeholder="Instructor"
                  />
                  <NumericInput
                    min={1} max={6} step={1}
                    value={course.credit_hours}
                    onChange={(v) => onUpdate({ credit_hours: Math.round(v) })}
                    className="input-field px-3 py-2 text-xs text-center"
                    placeholder="Credits"
                  />
                </div>
                <button
                  onClick={() => setEditingHeader(false)}
                  className="text-gold-500 text-xs hover:text-gold-300 transition-colors"
                >
                  Done editing
                </button>
              </div>
            ) : (
              <div
                className="cursor-pointer group"
                onClick={() => setEditingHeader(true)}
                title="Click to edit"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {course.course_code && (
                    <span className="text-gold-500 font-bold text-sm bg-gold-500/10 px-2 py-0.5 rounded">
                      {course.course_code}
                    </span>
                  )}
                  <span className="text-charcoal-500 text-xs">{course.credit_hours || 3} cr</span>
                  <svg className="w-3 h-3 text-charcoal-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <h2 className="text-white font-bold text-base mt-1 leading-tight group-hover:text-gold-100 transition-colors">
                  {course.course_name || 'Unnamed Course'}
                </h2>
                {course.instructor && course.instructor !== 'Staff' && (
                  <p className="text-charcoal-400 text-xs mt-0.5">{course.instructor}</p>
                )}
              </div>
            )}
          </div>

          {/* Current grade badge */}
          {letter && letter !== '—' && (
            <div className="text-center mr-3">
              <p className="text-charcoal-600 text-[10px] uppercase tracking-wide mb-0.5">Current</p>
              <div className={`text-3xl font-black leading-none ${letterColor(letter)}`}>{letter}</div>
              {weightedScore !== null && (
                <p className="text-charcoal-500 text-xs mt-0.5">{weightedScore}%</p>
              )}
            </div>
          )}

          <button onClick={onClose} className="text-charcoal-500 hover:text-white transition-colors p-1.5 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Weight bar */}
          {course.categories.length > 0 && <WeightBar categories={course.categories} />}

          {/* Incomplete notice */}
          {isIncomplete && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-charcoal-800/50 border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-charcoal-500 shrink-0" />
              <span className="text-charcoal-400 text-xs">
                Some categories not yet graded — toggle off to exclude from current grade
              </span>
            </div>
          )}

          {/* ── Categories ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-charcoal-400 text-xs font-medium uppercase tracking-wide">
                Grade Categories
              </p>
              {!weightOk && (
                <span className="text-red-400 text-xs">Weights: {totalCatWeight.toFixed(0)}% (need 100%)</span>
              )}
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={course.categories.map((_, i) => String(i))}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {course.categories.map((cat, i) => (
                    <SortableCategoryRow
                      key={i}
                      sortId={String(i)}
                      category={cat}
                      catIdx={i}
                      course={course}
                      colorClass={CAT_COLORS[i % CAT_COLORS.length]}
                      isOnly={course.categories.length === 1}
                      onUpdate={(idx, updates) => onUpdateCategory(idx, updates)}
                      onUpdateAssignment={onUpdateAssignment}
                      onToggleMode={onToggleEntryMode}
                      onRemove={onRemoveCategory}
                      communityStats={allCommunityStats[cat.name] || []}
                      onRefreshStats={fetchCommunityStats}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button
              onClick={onAddCategory}
              className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-white/10
                         text-charcoal-500 hover:text-white hover:border-gold-500/30 transition-all text-sm"
            >
              + Add Category
            </button>
          </div>

          {/* Grading scale */}
          <div>
            <p className="text-charcoal-400 text-xs font-medium uppercase tracking-wide mb-3">Grading Scale</p>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map((g) => (
                <div key={g}>
                  <label className="text-charcoal-500 text-xs block mb-1 text-center">{g}</label>
                  <div className="relative">
                    <NumericInput
                      min={0} max={100} step={1}
                      value={scale[g]}
                      onChange={(v) => onUpdate({ grading_scale: { ...course.grading_scale, [g]: v } })}
                      className="input-field w-full px-2 py-2 text-sm text-center"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-charcoal-600 text-[10px] pointer-events-none">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Share scaffold string */}
          <div className="pt-2 border-t border-white/[0.04]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-400 text-sm font-medium">Share grading structure</p>
                <p className="text-charcoal-600 text-xs mt-0.5">Copies a string others can paste in "Add Course"</p>
              </div>
              <button
                disabled={shareStatus === 'done'}
                onClick={() => {
                  try {
                    const scaffold = {
                      course_code: course.course_code || '',
                      course_name: course.course_name || '',
                      instructor: course.instructor || '',
                      credit_hours: course.credit_hours || 3,
                      grading_scale: course.grading_scale || { A: 90, B: 80, C: 70, D: 60 },
                      categories: course.categories.map((c) => ({
                        name: c.name, weight: c.weight, count: c.count ?? 1,
                      })),
                    };
                    const str = 'bgpa_course_v1_' + btoa(encodeURIComponent(JSON.stringify(scaffold)));
                    navigator.clipboard.writeText(str).catch(() => {
                      const el = document.createElement('textarea');
                      el.value = str;
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand('copy');
                      document.body.removeChild(el);
                    });
                    setShareStatus('done');
                    setTimeout(() => setShareStatus(null), 2500);
                  } catch { setShareStatus('error'); setTimeout(() => setShareStatus(null), 2000); }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  shareStatus === 'done'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : shareStatus === 'error'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                    : 'bg-gold-500/10 text-gold-400 border border-gold-500/20 hover:bg-gold-500/20'
                }`}
              >
                {shareStatus === 'done' ? '✓ Copied!' : shareStatus === 'error' ? 'Failed' : 'Copy String'}
              </button>
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-white/[0.04]">
            {showDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-charcoal-400 text-sm flex-1">Remove this course?</span>
                <button
                  onClick={onRemoveCourse}
                  className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Remove
                </button>
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-4 py-2 rounded-xl glass-card text-charcoal-400 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDelete(true)}
                className="text-charcoal-600 hover:text-red-400 transition-colors text-sm"
              >
                Remove course
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
