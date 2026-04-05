/**
 * CourseCard — compact course tile on the dashboard grid
 * Clicking opens CourseDetailModal. Hover shows curve explanation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:8000';
// Module-level cache: course_id → AI explanation string
const explanationCache = new Map();

const CAT_COLORS = ['bg-gold-500', 'bg-gold-300', 'bg-gold-700', 'bg-charcoal-400', 'bg-charcoal-300', 'bg-charcoal-500'];

const CONFIDENCE_STYLES = {
  high:   { dot: 'bg-green-400',  label: 'high confidence' },
  medium: { dot: 'bg-gold-500',   label: 'medium confidence' },
  low:    { dot: 'bg-charcoal-500', label: 'low confidence' },
};

function CurveTooltip({ prediction, courseId, anchorRect }) {
  const conf = CONFIDENCE_STYLES[prediction.confidence] || CONFIDENCE_STYLES.low;
  const hasCurve = prediction.curve_applied > 0;
  const [aiExplanation, setAiExplanation] = useState(explanationCache.get(courseId) || null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || explanationCache.has(courseId)) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch(`${API_BASE}/explain-curve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_name: prediction.course_name || '',
        course_code: prediction.course_code || '',
        current_score: prediction.current_score ?? 0,
        current_letter: prediction.current_letter || '—',
        predicted_score: prediction.predicted_score ?? prediction.current_score ?? 0,
        predicted_letter: prediction.predicted_letter || prediction.current_letter || '—',
        curve_applied: prediction.curve_applied ?? 0,
        confidence: prediction.confidence || 'low',
        data_source: prediction.data_source || 'none',
      }),
    })
      .then((r) => r.json())
      .then(({ explanation }) => {
        if (explanation) {
          explanationCache.set(courseId, explanation);
          setAiExplanation(explanation);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, prediction]);

  // Position tooltip below the card, but flip above if it would overflow viewport
  const TOOLTIP_WIDTH = 288; // w-72
  const TOOLTIP_EST_HEIGHT = 180;
  const GAP = 8;
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;

  const left = Math.min(
    anchorRect.left,
    window.innerWidth - TOOLTIP_WIDTH - 8
  );
  const spaceBelow = viewportHeight - (anchorRect.bottom - scrollY);
  const flipUp = spaceBelow < TOOLTIP_EST_HEIGHT + GAP;
  const top = flipUp
    ? anchorRect.top + scrollY - TOOLTIP_EST_HEIGHT - GAP
    : anchorRect.bottom + scrollY + GAP;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: flipUp ? 4 : -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: flipUp ? 4 : -4, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          top: flipUp ? anchorRect.top - TOOLTIP_EST_HEIGHT - GAP : anchorRect.bottom + GAP,
          left,
          width: TOOLTIP_WIDTH,
          zIndex: 9999,
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.7))',
          pointerEvents: 'none',
        }}
        className="glass-card p-3 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-charcoal-400 text-[10px] uppercase tracking-wide font-medium">
            Curve prediction
          </span>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
            <span className="text-charcoal-500 text-[10px]">{conf.label}</span>
          </div>
        </div>

        {/* Raw → Curved grade comparison */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-white/[0.04]">
            <span className="text-charcoal-500 text-[9px] uppercase tracking-wide mb-0.5">raw</span>
            <span className="text-white font-bold text-lg leading-none">{prediction.current_letter || '—'}</span>
            <span className="text-charcoal-600 text-[9px] mt-0.5">{prediction.current_score?.toFixed(1)}%</span>
          </div>
          {hasCurve ? (
            <>
              <div className="flex flex-col items-center gap-0.5">
                <svg className="w-4 h-4 text-gold-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-gold-500/60 text-[9px]">+{prediction.curve_applied}pts</span>
              </div>
              <div className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <span className="text-gold-500/60 text-[9px] uppercase tracking-wide mb-0.5">curved</span>
                <span className="text-gold-400 font-bold text-lg leading-none">{prediction.predicted_letter}</span>
                <span className="text-gold-600 text-[9px] mt-0.5">{prediction.predicted_score?.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <span className="text-charcoal-500 text-xs ml-1">No curve expected</span>
          )}
        </div>

        {/* AI explanation */}
        <div className="border-t border-white/[0.06] pt-2 min-h-[36px]">
          {loading ? (
            <div className="flex items-center gap-1.5">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-3 h-3 rounded-full border border-charcoal-700 border-t-gold-500 shrink-0" />
              <span className="text-charcoal-600 text-[11px]">Generating explanation…</span>
            </div>
          ) : (
            <p className="text-charcoal-400 text-[11px] leading-relaxed">
              {aiExplanation || prediction.explanation}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

const LETTER_STYLE = (letter) => {
  if (!letter || letter === '—') return 'text-charcoal-500';
  if (letter.startsWith('A')) return 'text-green-400';
  if (letter.startsWith('B')) return 'text-gold-500';
  if (letter.startsWith('C')) return 'text-yellow-500';
  return 'text-red-400';
};

export default function CourseCard({ course, gradeInfo, index, prediction, onClick }) {
  const { letter, weightedScore, isIncomplete } = gradeInfo;
  const [showCurve, setShowCurve] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const cardRef = useRef(null);

  const completedCats = course.categories.filter((c) => c.completed);
  const totalCats = course.categories.length;

  const hasCurve = prediction?.curve_applied > 0;
  const curvedLetter = prediction?.predicted_letter;

  const handleMouseEnter = () => {
    if (!prediction) return;
    if (cardRef.current) {
      setAnchorRect(cardRef.current.getBoundingClientRect());
    }
    setShowCurve(true);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: index * 0.05 }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowCurve(false)}
      className="glass-card glass-card-hover cursor-pointer p-4 flex flex-col gap-3 min-h-[140px] group relative"
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

        {/* Grade badge — always shows raw + predicted when prediction exists */}
        <div className="text-center shrink-0 min-w-[52px]">
          {prediction ? (
            <>
              {/* Raw */}
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-charcoal-600 text-[9px] uppercase tracking-wide">raw</span>
                <span className={`text-sm font-bold leading-none ${LETTER_STYLE(letter)}`}>{letter || '—'}</span>
              </div>
              {weightedScore !== null && (
                <p className="text-charcoal-600 text-[9px] mb-1">{weightedScore}%</p>
              )}
              {/* Divider */}
              <div className="border-t border-white/[0.08] mb-1" />
              {/* Predicted */}
              <span className="text-charcoal-600 text-[9px] uppercase tracking-wide block">pred</span>
              <div className={`text-xl font-black leading-none ${hasCurve ? 'text-gold-400' : LETTER_STYLE(curvedLetter)}`}>
                {curvedLetter || letter || '—'}
              </div>
            </>
          ) : (
            <>
              <div className={`text-2xl font-black leading-none ${LETTER_STYLE(letter)}`}>
                {letter || '—'}
              </div>
              {weightedScore !== null && (
                <p className="text-charcoal-500 text-[10px] mt-0.5">{weightedScore}%</p>
              )}
            </>
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
          {prediction && (
            <span className={`text-[10px] font-semibold ${hasCurve ? 'text-gold-500/70' : 'text-charcoal-600'}`}>
              {hasCurve ? `+${prediction.curve_applied}` : '~0'}
            </span>
          )}
          <svg className="w-3.5 h-3.5 text-charcoal-600 group-hover:text-charcoal-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Curve tooltip — rendered via portal to escape stacking contexts */}
      {showCurve && prediction && anchorRect && (
        <CurveTooltip prediction={prediction} courseId={course.id} anchorRect={anchorRect} />
      )}
    </motion.div>
  );
}
