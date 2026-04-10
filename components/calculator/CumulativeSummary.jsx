'use client';

import { useMemo } from 'react';
import { calculateProjectedGrade, percentageToLetter, letterToGpa } from '@/lib/calculator';
import { predictCourseOutcome } from '@/lib/predictor';

export function CumulativeSummary({ courses, allGrades, priorQP, priorHours, onChange }) {
  const semesterCourses = useMemo(() => {
    return courses.map(course => {
      const projected = calculateProjectedGrade(course);
      const credits = Number(course.credit_hours) || 3;

      // Curved projection: take projected score + historical curve estimate
      let curvedGPA = projected.gpa;
      if (projected.weightedScore !== null && allGrades?.length) {
        const prediction = predictCourseOutcome(course, allGrades);
        if (prediction.curve > 0) {
          const curvedScore = projected.weightedScore + prediction.curve;
          const curvedLetter = percentageToLetter(curvedScore, course.gradingScale || {});
          curvedGPA = letterToGpa(curvedLetter);
        }
      }

      return {
        name: course.course_name,
        code: course.course_code,
        credits,
        projectedGPA: projected.gpa,
        projectedScore: projected.weightedScore,
        curvedGPA,
        letter: projected.letter,
      };
    });
  }, [courses, allGrades]);

  const semesterHours = semesterCourses.reduce((s, c) => s + c.credits, 0);
  const entriesWithGrade = semesterCourses.filter(c => c.projectedGPA !== null);

  const semesterGPA = useMemo(() => {
    if (!entriesWithGrade.length) return null;
    const qp = entriesWithGrade.reduce((s, c) => s + c.projectedGPA * c.credits, 0);
    const hrs = entriesWithGrade.reduce((s, c) => s + c.credits, 0);
    return qp / hrs;
  }, [entriesWithGrade]);

  const semesterGPACurved = useMemo(() => {
    if (!entriesWithGrade.length) return null;
    const qp = entriesWithGrade.reduce((s, c) => s + c.curvedGPA * c.credits, 0);
    const hrs = entriesWithGrade.reduce((s, c) => s + c.credits, 0);
    return qp / hrs;
  }, [entriesWithGrade]);

  const pQP = parseFloat(priorQP);
  const pHours = parseFloat(priorHours);
  const hasPrior = !isNaN(pQP) && !isNaN(pHours) && pHours > 0;

  const cumulativeRaw = useMemo(() => {
    if (!hasPrior || !entriesWithGrade.length) return null;
    const semQP = entriesWithGrade.reduce((s, c) => s + c.projectedGPA * c.credits, 0);
    const semHrs = entriesWithGrade.reduce((s, c) => s + c.credits, 0);
    return (pQP + semQP) / (pHours + semHrs);
  }, [hasPrior, pQP, pHours, entriesWithGrade]);

  const cumulativeCurved = useMemo(() => {
    if (!hasPrior || !entriesWithGrade.length) return null;
    const semQP = entriesWithGrade.reduce((s, c) => s + c.curvedGPA * c.credits, 0);
    const semHrs = entriesWithGrade.reduce((s, c) => s + c.credits, 0);
    return (pQP + semQP) / (pHours + semHrs);
  }, [hasPrior, pQP, pHours, entriesWithGrade]);

  function gpaColor(gpa) {
    if (gpa === null) return 'text-charcoal-400';
    if (gpa >= 3.7) return 'text-green-400';
    if (gpa >= 3.0) return 'text-gold-500';
    if (gpa >= 2.0) return 'text-yellow-500';
    return 'text-red-400';
  }

  return (
    <div className="glass-card p-6 space-y-6">
      <h3 className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Cumulative GPA Projector</h3>

      {/* Prior semesters inputs */}
      <div>
        <p className="text-xs text-charcoal-400 mb-3">From your Purdue transcript (Prior Cumulative row)</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-charcoal-400 mb-1">GPA Hours</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={priorHours}
              onChange={e => onChange({ priorQP, priorHours: e.target.value })}
              placeholder="e.g., 62"
              className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-charcoal-400 mb-1">Quality Points</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priorQP}
              onChange={e => onChange({ priorQP: e.target.value, priorHours })}
              placeholder="e.g., 214.30"
              className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>
        </div>
        {hasPrior && (
          <p className="text-xs text-charcoal-500 mt-1">
            Current cumulative GPA: <span className="text-charcoal-300">{(pQP / pHours).toFixed(2)}</span>
          </p>
        )}
      </div>

      {/* Per-course breakdown */}
      {entriesWithGrade.length > 0 && (
        <div>
          <p className="text-xs text-charcoal-400 uppercase tracking-widest mb-2">This Semester</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-charcoal-500">
                <th className="text-left py-1.5">Course</th>
                <th className="text-right py-1.5">Cr</th>
                <th className="text-right py-1.5">Grade</th>
                <th className="text-right py-1.5">GPA pts</th>
                <th className="text-right py-1.5">w/ curve</th>
              </tr>
            </thead>
            <tbody>
              {semesterCourses.map(c => (
                <tr key={c.code || c.name} className="border-b border-white/5">
                  <td className="py-1.5 text-charcoal-300 truncate max-w-[140px]">
                    {c.code || c.name}
                  </td>
                  <td className="py-1.5 text-right text-charcoal-400">{c.credits}</td>
                  <td className="py-1.5 text-right text-charcoal-300">{c.letter}</td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${gpaColor(c.projectedGPA)}`}>
                    {c.projectedGPA !== null ? c.projectedGPA.toFixed(2) : '—'}
                  </td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${gpaColor(c.curvedGPA)}`}>
                    {c.curvedGPA !== null ? c.curvedGPA.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary stats */}
      {entriesWithGrade.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-white/10">
          <div>
            <div className="text-xs text-charcoal-400 mb-1">Semester GPA</div>
            <div className={`text-2xl font-bold tabular-nums ${gpaColor(semesterGPA)}`}>
              {semesterGPA !== null ? semesterGPA.toFixed(2) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-charcoal-400 mb-1">Semester GPA (curved)</div>
            <div className={`text-2xl font-bold tabular-nums ${gpaColor(semesterGPACurved)}`}>
              {semesterGPACurved !== null ? semesterGPACurved.toFixed(2) : '—'}
            </div>
          </div>
          {hasPrior && (
            <>
              <div>
                <div className="text-xs text-charcoal-400 mb-1">New Cumulative GPA</div>
                <div className={`text-2xl font-bold tabular-nums ${gpaColor(cumulativeRaw)}`}>
                  {cumulativeRaw !== null ? cumulativeRaw.toFixed(2) : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-charcoal-400 mb-1">New Cumulative (curved)</div>
                <div className={`text-2xl font-bold tabular-nums ${gpaColor(cumulativeCurved)}`}>
                  {cumulativeCurved !== null ? cumulativeCurved.toFixed(2) : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {courses.length === 0 && (
        <p className="text-charcoal-500 text-sm">Add courses above to see projections.</p>
      )}
    </div>
  );
}
