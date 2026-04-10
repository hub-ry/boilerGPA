'use client';

import { useState, useMemo } from 'react';
import { calculateCourseGrade, calculateProjectedGrade, computePercentile, computeMeanRelative } from '@/lib/calculator';
import { filterByCourse, computeAggregateStats } from '@/lib/grades';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Historical sidebar ───────────────────────────────────────────────────────

function HistoricalSidebar({ course, allGrades }) {
  const stats = useMemo(() => {
    if (!allGrades?.length || !course.course_code) return null;
    const m = course.course_code.trim().replace(/[\s\-_]+/g, '').match(/^([A-Za-z]+)(\d+)/);
    if (!m) return null;
    const matches = filterByCourse(allGrades, m[1].toUpperCase(), m[2]);
    if (!matches.length) return null;
    return { ...computeAggregateStats(matches), recordCount: matches.length };
  }, [course.course_code, allGrades]);

  if (!stats) {
    return (
      <div className="flex flex-col justify-center items-center h-full min-h-[80px] text-center px-2">
        <span className="text-xs text-charcoal-600">No historical data</span>
      </div>
    );
  }

  const bars = [
    { label: 'A', pct: stats.a_pct, color: 'bg-green-400' },
    { label: 'B', pct: stats.b_pct, color: 'bg-gold-500' },
    { label: 'C', pct: stats.c_pct, color: 'bg-yellow-500' },
    { label: 'D/F', pct: Math.round((stats.d_pct + stats.f_pct) * 10) / 10, color: 'bg-red-400' },
  ];

  const gpaColor = stats.avg_gpa >= 3.0 ? 'text-green-400' : stats.avg_gpa >= 2.0 ? 'text-gold-500' : 'text-red-400';

  return (
    <div className="space-y-3">
      <div>
        <div className={`text-2xl font-bold tabular-nums ${gpaColor}`}>{stats.avg_gpa?.toFixed(2)}</div>
        <div className="text-xs text-charcoal-500">avg GPA · {stats.recordCount} sections</div>
      </div>
      <div className="space-y-1.5">
        {bars.map(({ label, pct, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs text-charcoal-500 w-6 flex-shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-charcoal-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs text-charcoal-400 w-8 text-right tabular-nums">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Class Stats Form ─────────────────────────────────────────────────────────

function ClassStatsForm({ stats, onSave, onClose }) {
  const [mean,   setMean]   = useState(stats?.mean   ?? '');
  const [stdDev, setStdDev] = useState(stats?.stdDev ?? '');
  const [min,    setMin]    = useState(stats?.min    ?? '');
  const [max,    setMax]    = useState(stats?.max    ?? '');
  const [median, setMedian] = useState(stats?.median ?? '');

  const handleSave = () => {
    const parsed = {
      mean:   mean   !== '' ? parseFloat(mean)   : null,
      stdDev: stdDev !== '' ? parseFloat(stdDev) : null,
      min:    min    !== '' ? parseFloat(min)    : null,
      max:    max    !== '' ? parseFloat(max)    : null,
      median: median !== '' ? parseFloat(median) : null,
    };
    // Only save if at least mean is provided
    if (parsed.mean === null) { onClose(); return; }
    onSave(parsed);
    onClose();
  };

  return (
    <div className="mt-2 p-3 rounded bg-charcoal-900 border border-charcoal-600 space-y-2">
      <p className="text-xs text-charcoal-500">
        Paste the stats your professor released. Mean required; Std Dev unlocks percentile.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Mean',    mean,   setMean,   '20.21', true ],
          ['Std Dev', stdDev, setStdDev, '3.74',  false],
          ['Min',     min,    setMin,    '9',     false],
          ['Max',     max,    setMax,    '24',    false],
          ['Median',  median, setMedian, '21',    false],
        ].map(([label, val, setter, ph, req]) => (
          <div key={label} className={label === 'Median' ? 'col-span-2' : ''}>
            <label className="block text-xs text-charcoal-400 mb-1">
              {label}{req && <span className="text-gold-500 ml-0.5">*</span>}
            </label>
            <input
              type="number"
              value={val}
              onChange={e => setter(e.target.value)}
              placeholder={ph}
              className="w-full px-2 py-1 rounded bg-charcoal-800 border border-charcoal-600 text-white text-sm focus:outline-none focus:border-gold-500"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={handleSave} className="button-primary text-xs px-3 py-1">Save</button>
        {stats?.mean != null && (
          <button onClick={() => { onSave(null); onClose(); }} className="text-xs text-red-400 hover:text-red-300">
            Clear
          </button>
        )}
        <button onClick={onClose} className="text-xs text-charcoal-500 hover:text-charcoal-300 ml-auto">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Stats badge (percentile or above/below mean) ─────────────────────────────

function StatsBadge({ score, stats }) {
  if (!stats?.mean || score === null || score === '') return null;
  const numScore = parseFloat(score);
  if (isNaN(numScore)) return null;

  const pct = computePercentile(numScore, stats.mean, stats.stdDev);

  if (pct !== null) {
    const cls = pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-gold-500' : pct >= 25 ? 'text-yellow-500' : 'text-red-400';
    return <span className={`text-xs font-bold tabular-nums ${cls}`}>{pct}th pct</span>;
  }

  // Partial stats: mean only
  const { label, positive } = computeMeanRelative(numScore, stats.mean);
  return <span className={`text-xs font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>{label}</span>;
}

// ─── Single assignment row ─────────────────────────────────────────────────────

function AssignmentRow({ label, score, stats, onScoreChange, onStatsSave }) {
  const [statsOpen, setStatsOpen] = useState(false);
  const hasStats = stats?.mean != null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-charcoal-300 w-28 flex-shrink-0 truncate" title={label}>
          {label}
        </span>
        <input
          type="number"
          min="0"
          max="100"
          value={score ?? ''}
          onChange={e => onScoreChange(e.target.value)}
          placeholder="Score"
          className="flex-1 min-w-0 px-2 py-1.5 rounded bg-charcoal-800 border border-charcoal-600 text-white text-sm focus:outline-none focus:border-gold-500"
        />
        <StatsBadge score={score} stats={stats} />
      </div>
      {/* Stats toggle */}
      <button
        type="button"
        onClick={() => setStatsOpen(o => !o)}
        className="ml-30 text-xs text-charcoal-600 hover:text-gold-500 transition-colors pl-[7.5rem]"
      >
        {hasStats
          ? `μ${stats.mean}${stats.stdDev ? ` σ${stats.stdDev}` : ''} — edit stats`
          : '+ Add class stats'}
      </button>
      {statsOpen && (
        <ClassStatsForm
          stats={stats}
          onSave={s => { onStatsSave(s); }}
          onClose={() => setStatsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Category block ───────────────────────────────────────────────────────────

function CategoryBlock({ cat, onCategoryChange }) {
  const [expanded, setExpanded] = useState(false);
  const isMulti = cat.count > 1;

  const statsArr = Array.isArray(cat.classStats)
    ? cat.classStats
    : Array(Math.max(cat.count, 1)).fill(null);

  const handleScoreChange = (itemIdx, value) => {
    if (isMulti) {
      const newScores = [...(cat.scores?.length === cat.count ? cat.scores : Array(cat.count).fill(''))];
      newScores[itemIdx] = value;
      onCategoryChange({ scores: newScores });
    } else {
      onCategoryChange({ score: value !== '' ? parseFloat(value) : null });
    }
  };

  const handleStatsSave = (itemIdx, newStats) => {
    const next = [...statsArr];
    next[itemIdx] = newStats;
    onCategoryChange({ classStats: next });
  };

  // Completion count for multi-cat header
  const enteredCount = isMulti
    ? (cat.scores || []).filter(s => s !== '' && s !== null && s !== undefined).length
    : null;

  if (!isMulti) {
    // ── Single item (Final, single Midterm, etc.) ──────────────────────────
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-white">{cat.name}</span>
          <span className="text-xs text-charcoal-400">{cat.weight}% weight</span>
        </div>
        <AssignmentRow
          label={cat.name}
          score={cat.score ?? ''}
          stats={statsArr[0]}
          onScoreChange={v => handleScoreChange(0, v)}
          onStatsSave={s => handleStatsSave(0, s)}
        />
      </div>
    );
  }

  // ── Multi-item: collapsible section ───────────────────────────────────────
  return (
    <div className="rounded border border-charcoal-700/60 overflow-hidden">
      {/* Category header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-charcoal-800/60 hover:bg-charcoal-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-charcoal-500 text-xs"
          >
            ▶
          </motion.span>
          <span className="text-sm font-semibold text-white">{cat.name}</span>
          <span className="text-xs text-charcoal-500">
            {enteredCount}/{cat.count} entered
          </span>
        </div>
        <span className="text-xs text-charcoal-400">{cat.weight}% weight</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-3 bg-charcoal-900/30">
              {Array(cat.count).fill(null).map((_, i) => (
                <AssignmentRow
                  key={i}
                  label={`${cat.name} ${i + 1}`}
                  score={(cat.scores || [])[i] ?? ''}
                  stats={statsArr[i]}
                  onScoreChange={v => handleScoreChange(i, v)}
                  onStatsSave={s => handleStatsSave(i, s)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────

export function CourseCard({ course, onUpdate, onRemove, allGrades }) {
  const [expanded, setExpanded] = useState(false);
  const current   = calculateCourseGrade(course);
  const projected = calculateProjectedGrade(course);

  const handleCategoryChange = (index, updates) => {
    const updated = course.categories.map((c, i) =>
      i === index ? { ...c, ...updates } : c
    );
    onUpdate({ categories: updated });
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors"
      >
        <div>
          <h3 className="text-xl font-bold text-white">
            {course.course_name}
            {course.course_code && (
              <span className="text-charcoal-400 text-sm ml-2">({course.course_code})</span>
            )}
          </h3>
          <p className="text-charcoal-400 text-sm">
            {course.instructor} • {course.credit_hours} credits
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-charcoal-400 text-xs mb-1">Current Grade</div>
            <div className="text-2xl font-bold text-gold-500">
              {current.weightedScore !== null ? current.weightedScore.toFixed(1) : '—'}%
            </div>
          </div>
          <motion.svg
            animate={{ rotate: expanded ? 180 : 0 }}
            className="w-5 h-5 text-charcoal-500 shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex border-t border-white/10">
              {/* Main content */}
              <div className="flex-1 min-w-0 px-6 pb-6">
                <div className="space-y-4 mt-4 mb-6">
                  {course.categories.map((cat, idx) => (
                    <CategoryBlock
                      key={idx}
                      cat={cat}
                      onCategoryChange={updates => handleCategoryChange(idx, updates)}
                    />
                  ))}
                </div>

                {/* Grade summary */}
                <div className="grid grid-cols-3 gap-4 mb-6 p-4 rounded bg-charcoal-800/50">
                  <div>
                    <div className="text-xs text-charcoal-400 mb-1">Current</div>
                    <div className="text-lg font-bold text-white">
                      {current.weightedScore !== null ? current.weightedScore.toFixed(1) : '—'}%
                    </div>
                    <div className="text-sm font-semibold text-gold-500">{current.letter}</div>
                  </div>
                  <div>
                    <div className="text-xs text-charcoal-400 mb-1">Projected</div>
                    <div className="text-lg font-bold text-white">
                      {projected.weightedScore !== null ? projected.weightedScore.toFixed(1) : '—'}%
                    </div>
                    <div className="text-sm font-semibold text-gold-500">{projected.letter}</div>
                  </div>
                  <div>
                    <div className="text-xs text-charcoal-400 mb-1">GPA pts</div>
                    <div className="text-lg font-bold text-white">
                      {current.gpa !== null ? current.gpa.toFixed(2) : '—'}
                    </div>
                    {current.isIncomplete && (
                      <div className="text-xs text-yellow-500">Incomplete</div>
                    )}
                  </div>
                </div>

                <button
                  onClick={onRemove}
                  className="w-full px-4 py-2 rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 transition-colors text-sm"
                >
                  Remove Course
                </button>
              </div>

              {/* Historical sidebar */}
              <div className="w-44 flex-shrink-0 border-l border-white/10 px-4 py-5">
                <div className="text-xs text-charcoal-500 uppercase tracking-widest mb-3">Historical</div>
                <HistoricalSidebar course={course} allGrades={allGrades} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
