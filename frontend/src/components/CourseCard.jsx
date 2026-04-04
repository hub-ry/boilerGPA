/**
 * CourseCard — compact course tile on the dashboard grid
 * Clicking opens CourseDetailModal
 */

import React from 'react';
import { motion } from 'framer-motion';

const CAT_COLORS = ['bg-gold-500', 'bg-gold-300', 'bg-gold-700', 'bg-charcoal-400', 'bg-charcoal-300', 'bg-charcoal-500'];

const LETTER_STYLE = (letter) => {
  if (!letter || letter === '—') return 'text-charcoal-500';
  if (letter.startsWith('A')) return 'text-green-400';
  if (letter.startsWith('B')) return 'text-gold-500';
  if (letter.startsWith('C')) return 'text-yellow-500';
  return 'text-red-400';
};

export default function CourseCard({ course, gradeInfo, index, onClick }) {
  const { letter, weightedScore, completedWeight, isIncomplete } = gradeInfo;

  const completedCats = course.categories.filter((c) => c.completed);
  const totalCats = course.categories.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: index * 0.05 }}
      onClick={onClick}
      className="glass-card glass-card-hover cursor-pointer p-4 flex flex-col gap-3 min-h-[140px] group"
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          {course.course_code && (
            <span className="text-gold-500 font-bold text-xs bg-gold-500/10 px-2 py-0.5 rounded inline-block mb-1">
              {course.course_code}
            </span>
          )}
          <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 group-hover:text-gold-100 transition-colors">
            {course.course_name || 'Unnamed Course'}
          </h3>
        </div>

        {/* Grade badge */}
        <div className="text-center shrink-0">
          <div className={`text-2xl font-black leading-none ${LETTER_STYLE(letter)}`}>
            {letter || '—'}
          </div>
          {weightedScore !== null && (
            <p className="text-charcoal-500 text-[10px] mt-0.5">{weightedScore}%</p>
          )}
        </div>
      </div>

      {/* Weight bar */}
      {course.categories.length > 0 && (
        <div className="h-1 rounded-full overflow-hidden flex gap-px">
          {course.categories.map((cat, i) => (
            <div
              key={i}
              style={{ width: `${cat.weight}%` }}
              className={`${CAT_COLORS[i % CAT_COLORS.length]} h-full ${!cat.completed ? 'opacity-25' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          <span className="text-charcoal-600 text-xs">{course.credit_hours || 3} cr</span>
          {course.instructor && course.instructor !== 'Staff' && (
            <>
              <span className="text-charcoal-700 text-xs">·</span>
              <span className="text-charcoal-500 text-xs truncate max-w-[80px]">{course.instructor}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isIncomplete && (
            <span className="text-charcoal-600 text-[10px]">
              {completedCats.length}/{totalCats} graded
            </span>
          )}
          <svg className="w-3.5 h-3.5 text-charcoal-600 group-hover:text-charcoal-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
