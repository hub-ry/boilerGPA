/**
 * GradeEntry — Step 2: Enter scores for each course category
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CourseCard from './CourseCard';

export default function GradeEntry({
  courses,
  onUpdateCategory,
  onUpdateCourse,
  onRemoveCourse,
  onCalculate,
  onAddAnother,
  onBack,
  isLoading,
  error,
  searchCourses,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchCourses(q);
    setSearchResults(results);
    setSearching(false);
  };

  const hasAnyScore = courses.some((c) =>
    c.categories?.some((cat) => cat.score !== '' && cat.score !== null)
  );

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
              <h2 className="text-white font-bold text-xl leading-tight">Enter Your Grades</h2>
            </div>
          </div>

          <div className="text-right">
            <span className="text-charcoal-400 text-xs">
              {courses.length} course{courses.length !== 1 ? 's' : ''}
            </span>
          </div>
        </motion.div>

        {/* Step indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-8"
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                s <= 2 ? 'bg-gold-500' : 'bg-charcoal-700'
              }`}
            />
          ))}
        </motion.div>

        {/* Course cards */}
        <AnimatePresence mode="popLayout">
          {courses.map((course, i) => (
            <CourseCard
              key={course.id}
              course={course}
              index={i}
              onUpdate={onUpdateCourse}
              onUpdateCategory={onUpdateCategory}
              onRemove={onRemoveCourse}
            />
          ))}
        </AnimatePresence>

        {/* Add Another Course */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <AnimatePresence>
            {showSearch ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card p-4 mb-4 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search by course code or title (e.g. CS 251)"
                    className="input-field flex-1 px-3 py-2.5 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                    className="text-charcoal-500 hover:text-white transition-colors p-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {searching && (
                    <div className="text-center py-3 text-charcoal-500 text-sm">Searching...</div>
                  )}
                  {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
                    <div className="text-center py-3 text-charcoal-500 text-sm">No courses found</div>
                  )}
                  {searchResults.map((course, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => {
                        onAddAnother(course);
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-gold-500 font-semibold text-sm mr-2">
                        {course.Subject} {course.Number}
                      </span>
                      <span className="text-white text-sm">{course.Title}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.button
                onClick={onAddAnother}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full glass-card glass-card-hover py-4 px-5 flex items-center justify-center gap-2 text-charcoal-400 hover:text-white transition-colors mb-6 border-dashed"
                style={{ borderStyle: 'dashed' }}
              >
                <svg className="w-4 h-4 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Add Another Course</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Calculate CTA */}
          <motion.button
            onClick={onCalculate}
            disabled={isLoading || courses.length === 0}
            whileHover={!isLoading ? { scale: 1.02 } : {}}
            whileTap={!isLoading ? { scale: 0.98 } : {}}
            className="gold-btn w-full py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 rounded-full border-2 border-charcoal-800 border-t-charcoal-950"
                />
                <span>Calculating...</span>
              </>
            ) : (
              <>
                <span>Calculate My GPA</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </motion.button>

          {!hasAnyScore && (
            <p className="text-charcoal-600 text-xs text-center mt-3">
              Enter at least one score to calculate. Leave future assignments toggled off.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
