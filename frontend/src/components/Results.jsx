/**
 * Results — Step 3: Animated GPA display with predictions, curve data, and score calculator
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';

// Animated GPA counter
function GPACounter({ value, delay = 0 }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 60, damping: 18 });
  const display = useTransform(spring, (v) => v.toFixed(2));
  const [displayText, setDisplayText] = useState('0.00');

  useEffect(() => {
    const timer = setTimeout(() => {
      motionVal.set(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay, motionVal]);

  useEffect(() => {
    return display.on('change', (v) => setDisplayText(v));
  }, [display]);

  return <span>{displayText}</span>;
}

function ConfidenceBadge({ level }) {
  const classes = {
    high: 'confidence-high',
    medium: 'confidence-medium',
    low: 'confidence-low',
  };

  const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
  const icons = { high: '●', medium: '◐', low: '○' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${classes[level] || classes.low}`}>
      <span className="text-[8px]">{icons[level] || '○'}</span>
      {labels[level] || 'Unknown confidence'}
    </span>
  );
}

function FinalScoreCalculator({ course, courseResult, predResult }) {
  const [finalWeight, setFinalWeight] = useState('');
  const [scores, setScores] = useState(null);

  const calculate = async () => {
    if (!finalWeight || parseFloat(finalWeight) <= 0) return;

    const completedWeight = courseResult?.completed_weight || 0;
    const currentScore = courseResult?.weighted_score || 0;

    // Calculate locally
    const targets = { A: 90, B: 80, C: 70, D: 60 };
    const fw = parseFloat(finalWeight);
    const results = {};

    for (const [grade, target] of Object.entries(targets)) {
      const needed = (target * 100 - currentScore * completedWeight) / fw;
      results[grade] = needed > 100 || needed < 0 ? null : Math.round(needed * 10) / 10;
    }

    setScores(results);
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <p className="text-charcoal-400 text-xs font-medium uppercase tracking-wide mb-3">
        What do I need on the final?
      </p>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="number"
            min="1"
            max="100"
            value={finalWeight}
            onChange={(e) => setFinalWeight(e.target.value)}
            placeholder="Final exam weight (%)"
            className="input-field w-full px-3 py-2 text-sm"
          />
        </div>
        <motion.button
          onClick={calculate}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="gold-btn px-4 py-2 text-sm"
        >
          Calculate
        </motion.button>
      </div>

      <AnimatePresence>
        {scores && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-4 gap-2 mt-3"
          >
            {Object.entries(scores).map(([grade, score]) => (
              <div
                key={grade}
                className={`text-center p-2 rounded-lg ${
                  score === null
                    ? 'bg-red-500/10 border border-red-500/20'
                    : score <= 80
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                <div className={`font-bold text-sm ${score === null ? 'text-red-400' : 'text-white'}`}>
                  {grade}
                </div>
                <div className={`text-xs mt-0.5 ${score === null ? 'text-red-400/70' : 'text-charcoal-400'}`}>
                  {score === null ? 'N/A' : `${score}%`}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CourseResultCard({ course, calcCourse, index }) {
  const [expanded, setExpanded] = useState(false);

  const gpaImproved = course.predicted_gpa > course.current_gpa;
  const gpaSame = Math.abs(course.predicted_gpa - course.current_gpa) < 0.1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.4 + index * 0.1,
        type: 'spring',
        stiffness: 200,
        damping: 22,
      }}
      className="glass-card p-5"
    >
      {/* Course header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 mr-3">
          {course.course_code && (
            <span className="text-gold-500 font-bold text-xs bg-gold-500/10 px-2 py-0.5 rounded-md mr-2">
              {course.course_code}
            </span>
          )}
          <h4 className="text-white font-semibold mt-1">{course.course_name}</h4>
          {course.instructor && course.instructor !== 'Staff' && (
            <p className="text-charcoal-500 text-xs mt-0.5">{course.instructor}</p>
          )}
        </div>
        <ConfidenceBadge level={course.confidence} />
      </div>

      {/* Grade comparison */}
      <div className="flex items-center gap-4 mb-4">
        {/* Current */}
        <div className="flex-1 bg-white/[0.03] rounded-xl p-3 text-center">
          <p className="text-charcoal-500 text-xs mb-1">Current</p>
          <p className="text-white text-2xl font-black">{course.current_letter}</p>
          <p className="text-charcoal-400 text-xs mt-0.5">{course.current_score?.toFixed(1)}%</p>
        </div>

        {/* Arrow */}
        <div className="text-charcoal-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>

        {/* Predicted */}
        <div className={`flex-1 rounded-xl p-3 text-center ${
          gpaImproved
            ? 'bg-gold-500/10 border border-gold-500/20'
            : gpaSame
            ? 'bg-white/[0.03]'
            : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <p className="text-charcoal-500 text-xs mb-1">Predicted</p>
          <p className={`text-2xl font-black ${
            gpaImproved ? 'text-gold-500' : gpaSame ? 'text-white' : 'text-red-400'
          }`}>
            {course.predicted_letter}
          </p>
          <p className="text-charcoal-400 text-xs mt-0.5">{course.predicted_score?.toFixed(1)}%</p>
        </div>
      </div>

      {/* Curve info */}
      {course.curve_applied > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-gold-500/5 border border-gold-500/10">
          <span className="text-gold-500 text-sm">↑</span>
          <span className="text-charcoal-300 text-xs">
            +{course.curve_applied} point curve applied
          </span>
        </div>
      )}

      {/* Explanation */}
      {course.explanation && (
        <p className="text-charcoal-500 text-xs mb-3 leading-relaxed">
          {course.explanation}
        </p>
      )}

      {/* Final score calculator toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-charcoal-500 hover:text-gold-500 text-xs transition-colors flex items-center gap-1"
      >
        <motion.svg
          animate={{ rotate: expanded ? 180 : 0 }}
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
        What score do I need on the final?
      </button>

      <AnimatePresence>
        {expanded && (
          <FinalScoreCalculator
            course={course}
            courseResult={calcCourse}
            predResult={course}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Results({ gpaResult, predictionResult, onReset, onBack }) {
  const [copied, setCopied] = useState(false);

  const currentGPA = gpaResult?.gpa || 0;
  const predictedGPA = predictionResult?.predicted_gpa || 0;
  const gpaImproved = predictedGPA > currentGPA;
  const gpaWorse = predictedGPA < currentGPA - 0.05;

  const handleShare = () => {
    const text = `BoilerGPA predicts I'll finish the semester with a ${predictedGPA.toFixed(2)} 🎓`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-charcoal-500 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-gold-500 flex items-center justify-center">
                  <span className="text-charcoal-950 font-black text-xs">B</span>
                </div>
                <span className="text-gold-500 font-bold text-sm">BoilerGPA</span>
              </div>
              <h2 className="text-white font-bold text-xl">Your Results</h2>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <div key={s} className="h-1 w-8 rounded-full bg-gold-500" />
            ))}
          </div>
        </motion.div>

        {/* GPA Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass-card p-8 mb-6 text-center"
        >
          <p className="text-charcoal-400 text-sm mb-1 uppercase tracking-widest font-medium">
            Current Semester GPA
          </p>

          <div className="text-7xl font-black text-white my-4 tracking-tight">
            <GPACounter value={currentGPA} delay={200} />
          </div>

          {gpaResult?.is_incomplete && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-charcoal-700/50 text-charcoal-400 text-xs mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-charcoal-500" />
              Based on graded work only — incomplete semester
            </div>
          )}

          {/* Predicted GPA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className={`mt-4 pt-6 border-t ${
              gpaImproved
                ? 'border-gold-500/20'
                : gpaWorse
                ? 'border-red-500/20'
                : 'border-white/10'
            }`}
          >
            <p className="text-charcoal-400 text-sm mb-1 uppercase tracking-widest font-medium">
              Predicted Final GPA
            </p>

            <div className={`text-5xl font-black my-3 tracking-tight ${
              gpaImproved ? 'text-gold-500' : gpaWorse ? 'text-red-400' : 'text-white'
            }`}>
              <GPACounter value={predictedGPA} delay={600} />
              {gpaImproved && (
                <span className="text-gold-500/50 ml-2 text-2xl">↑</span>
              )}
            </div>

            <p className="text-charcoal-500 text-sm">
              {gpaImproved
                ? `+${(predictedGPA - currentGPA).toFixed(2)} boost from historical curves`
                : gpaWorse
                ? 'Below current — limited curve history for your courses'
                : 'Matches current grade — minimal historical curve data'}
            </p>
          </motion.div>
        </motion.div>

        {/* Per-course breakdown */}
        <motion.h3
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-charcoal-400 text-xs font-medium uppercase tracking-wide mb-4"
        >
          Course Breakdown
        </motion.h3>

        <div className="space-y-4 mb-8">
          {predictionResult?.courses?.map((course, i) => {
            const calcCourse = gpaResult?.courses?.find(
              (c) => c.course_code === course.course_code || c.course_name === course.course_name
            );
            return (
              <CourseResultCard
                key={course.course_code || i}
                course={course}
                calcCourse={calcCourse}
                index={i}
              />
            );
          })}
        </div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex gap-3"
        >
          {/* Share */}
          <motion.button
            onClick={handleShare}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex-1 glass-card glass-card-hover py-3.5 flex items-center justify-center gap-2 text-charcoal-300 hover:text-white transition-colors text-sm font-medium"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-green-400 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </motion.span>
              ) : (
                <motion.span
                  key="share"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  Share Result
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Start Over */}
          <motion.button
            onClick={onReset}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="gold-btn flex-1 py-3.5 text-sm font-bold flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Start Over
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
