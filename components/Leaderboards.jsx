'use client';

import { useState, useMemo } from 'react';
import { filterByCourse, computeAggregateStats } from '@/lib/grades';

const CURRENT_SEMESTER = 'Spring 2026';

function CourseResult({ subject, number, stats }) {
  return (
    <div className="border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-lg">{subject} {number}</span>
        <span className="text-gold-500 font-bold">{stats.avg_gpa?.toFixed(2)} GPA</span>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center text-xs">
        {[['A', stats.a_pct, 'text-green-400'], ['B', stats.b_pct, 'text-blue-400'], ['C', stats.c_pct, 'text-yellow-400'], ['D', stats.d_pct, 'text-orange-400'], ['F', stats.f_pct, 'text-red-400']].map(([letter, pct, color]) => (
          <div key={letter}>
            <div className={`font-bold ${color}`}>{letter}</div>
            <div className="text-charcoal-400">{pct}%</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-charcoal-500">
        Class avg: {stats.classAvg}% · {stats.recordCount} sections recorded
      </div>
    </div>
  );
}

function CourseLookup({ allGrades }) {
  const [query, setQuery] = useState('');

  const result = useMemo(() => {
    const q = query.trim().replace(/[\s\-_]+/g, '').toUpperCase();
    if (q.length < 2) return null;
    const match = q.match(/^([A-Z]+)(\d+)/);
    if (!match) return null;
    const [, subject, number] = match;
    const records = filterByCourse(allGrades, subject, number);
    if (!records.length) return { subject, number, notFound: true };
    return { subject, number, stats: computeAggregateStats(records), notFound: false };
  }, [query, allGrades]);

  return (
    <div>
      <h3 className="font-bold text-lg mb-3">Course Lookup</h3>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. CS 25100 or MA26100"
        className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500"
      />
      <div className="mt-3">
        {result && result.notFound && (
          <p className="text-charcoal-500 text-sm">No historical data for {result.subject} {result.number}.</p>
        )}
        {result && !result.notFound && (
          <CourseResult subject={result.subject} number={result.number} stats={result.stats} />
        )}
      </div>
    </div>
  );
}

export function Leaderboards({ allGrades }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Spring 2026 live stats */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold mb-1">{CURRENT_SEMESTER} Stats</h2>
        <p className="text-charcoal-500 text-sm mb-6">Live rankings update as students submit data.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-white/10 p-6">
            <h3 className="font-bold mb-4 text-red-400">Most Cooked This Semester</h3>
            <p className="text-charcoal-500 text-sm italic">
              Start calculating your grades so we can see!
            </p>
          </div>
          <div className="border border-white/10 p-6">
            <h3 className="font-bold mb-4 text-green-400">Highest Performers This Semester</h3>
            <p className="text-charcoal-500 text-sm italic">
              Start calculating your grades so we can see!
            </p>
          </div>
        </div>
      </div>

      {/* Historical lookup */}
      <div className="border-t border-white/10 pt-8">
        <CourseLookup allGrades={allGrades} />
      </div>
    </div>
  );
}
