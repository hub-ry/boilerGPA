'use client';

import { useMemo } from 'react';
import { computePercentile, computeMeanRelative, predictGradeFromPercentile } from '@/lib/calculator';
import { filterByCourse, computeAggregateStats } from '@/lib/grades';

function parseCourseCode(code) {
  if (!code) return { subject: '', number: '' };
  const normalized = code.trim().replace(/[\s\-_]+/g, '');
  const match = normalized.match(/^([A-Za-z]+)(\d+)/);
  if (match) return { subject: match[1].toUpperCase(), number: match[2] };
  return { subject: '', number: '' };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pctColor(pct) {
  return pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-gold-500' : pct >= 25 ? 'text-yellow-500' : 'text-red-400';
}

function pctBarColor(pct) {
  return pct >= 75 ? 'bg-green-400' : pct >= 50 ? 'bg-gold-500' : pct >= 25 ? 'bg-yellow-500' : 'bg-red-400';
}

export function CurvePredictor({ course, allGrades }) {
  const { subject, number } = parseCourseCode(course.course_code);

  const historicalStats = useMemo(() => {
    if (!subject || !number || !allGrades?.length) return null;
    const matches = filterByCourse(allGrades, subject, number);
    if (!matches.length) return null;
    return { ...computeAggregateStats(matches), recordCount: matches.length };
  }, [subject, number, allGrades]);

  // Build flat list of all items that have class stats + a score
  const items = useMemo(() => {
    const result = [];
    for (const cat of course.categories || []) {
      const statsArr = Array.isArray(cat.classStats)
        ? cat.classStats
        : Array(cat.count).fill(null);
      const isMulti = cat.count > 1;

      for (let i = 0; i < cat.count; i++) {
        const stats = statsArr[i];
        if (!stats?.mean) continue; // need at least mean

        let score;
        if (isMulti) {
          const v = parseFloat((cat.scores || [])[i]);
          if (isNaN(v)) continue;
          score = v;
        } else {
          const v = parseFloat(cat.score);
          if (isNaN(v)) continue;
          score = v;
        }

        const pct = computePercentile(score, stats.mean, stats.stdDev); // null if no stdDev
        const meanRel = pct === null ? computeMeanRelative(score, stats.mean) : null;
        const predictedGrade = pct !== null && historicalStats
          ? predictGradeFromPercentile(pct, historicalStats)
          : null;

        result.push({
          label: isMulti ? `${cat.name} ${i + 1}` : cat.name,
          score,
          stats,
          pct,
          meanRel,
          predictedGrade,
        });
      }
    }
    return result;
  }, [course.categories, historicalStats]);

  const hasItems = items.length > 0;
  const hasHistorical = historicalStats !== null;

  if (!hasItems && !hasHistorical) return null;

  return (
    <div className="glass-card p-5 mt-3 space-y-4">
      <h4 className="text-sm font-semibold text-gold-500">Historical Predictor</h4>

      {/* Per-item percentile cards */}
      {hasItems && (
        <div className="space-y-2">
          <p className="text-xs text-charcoal-400 uppercase tracking-widest">Your percentile</p>
          {items.map(({ label, score, stats, pct, meanRel, predictedGrade }) => (
            <div key={label} className="rounded bg-charcoal-800/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{label}</span>
                {pct !== null ? (
                  <span className={`text-xl font-bold tabular-nums ${pctColor(pct)}`}>
                    {ordinal(pct)}
                  </span>
                ) : (
                  <span className={`text-sm font-semibold ${meanRel?.positive ? 'text-green-400' : 'text-red-400'}`}>
                    {meanRel?.label}
                  </span>
                )}
              </div>

              {pct !== null && (
                <div className="h-1.5 rounded-full bg-charcoal-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pctBarColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-charcoal-400">
                <span>
                  Your score: <span className="text-white">{score.toFixed(1)}</span>
                  {stats.max != null && <span> / {stats.max}</span>}
                </span>
                <span>
                  Mean: <span className="text-white">{stats.mean}</span>
                  {stats.stdDev != null
                    ? <span className="text-charcoal-500"> ±{stats.stdDev}</span>
                    : <span className="text-charcoal-600"> (add σ for percentile)</span>}
                </span>
              </div>

              {predictedGrade && hasHistorical && (
                <p className="text-xs text-charcoal-300">
                  At the {ordinal(pct)} percentile, historical distributions suggest a{' '}
                  <span className="font-semibold text-gold-500">{predictedGrade}</span>
                  {' '}— based on {historicalStats.recordCount} past sections
                  {historicalStats.a_pct > 0 && (
                    <span className="text-charcoal-500">
                      {' '}({historicalStats.a_pct}% A · {historicalStats.b_pct}% B · {historicalStats.c_pct}% C)
                    </span>
                  )}.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Historical distribution — shown as primary when no class stats, as footer when stats present */}
      {hasHistorical && (
        <div className={hasItems ? 'border-t border-white/10 pt-3' : 'space-y-3'}>
          {!hasItems && (
            <>
              <p className="text-xs text-charcoal-400">
                Based on{' '}
                <span className="text-white">{historicalStats.recordCount}</span>{' '}
                historical sections
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-charcoal-400">Class Average</div>
                  <div className="text-lg font-bold">{historicalStats.classAvg}%</div>
                </div>
                <div>
                  <div className="text-xs text-charcoal-400">Avg GPA</div>
                  <div className="text-lg font-bold">{historicalStats.avg_gpa?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-charcoal-400">A rate</div>
                  <div className="text-lg font-bold text-green-400">{historicalStats.a_pct}%</div>
                </div>
                <div>
                  <div className="text-xs text-charcoal-400">C or below</div>
                  <div className="text-lg font-bold text-red-400">
                    {Math.round((historicalStats.c_pct + historicalStats.d_pct + historicalStats.f_pct) * 10) / 10}%
                  </div>
                </div>
              </div>
              <p className="text-xs text-charcoal-500 italic">
                Use &ldquo;▶&rdquo; next to any score to add class statistics for a percentile-based prediction.
              </p>
            </>
          )}
          {hasItems && (
            <p className="text-xs text-charcoal-500">
              Historical dist: {historicalStats.a_pct}% A · {historicalStats.b_pct}% B · {historicalStats.c_pct}% C · avg GPA {historicalStats.avg_gpa?.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
