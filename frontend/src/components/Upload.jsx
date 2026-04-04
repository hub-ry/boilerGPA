/**
 * Upload — Step 1: Landing page with drag-and-drop PDF upload
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';

const LOADING_STEPS = [
  { icon: '📄', text: "Reading your syllabus so you don't have to..." },
  { icon: '⚖️', text: 'Extracting grading weights...' },
  { icon: '📊', text: 'Parsing assignment categories...' },
  { icon: '🎯', text: 'Building your grade breakdown...' },
  { icon: '✨', text: 'Almost there...' },
];

function CourseSearchModal({ onSelect, onClose, searchCourses }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const data = await searchCourses(query);
      setResults(data);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, searchCourses]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="glass-card w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Search Purdue Courses</h3>
          <button
            onClick={onClose}
            className="text-charcoal-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. CS 251, Data Structures, MA 161..."
          className="input-field w-full px-4 py-3 text-sm mb-4"
          autoFocus
        />

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {searching && (
            <div className="text-center py-4 text-charcoal-400 text-sm">Searching...</div>
          )}
          {!searching && results.length === 0 && query.length >= 2 && (
            <div className="text-center py-4 text-charcoal-400 text-sm">No courses found</div>
          )}
          {results.map((course, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelect(course)}
              className="w-full text-left px-4 py-3 rounded-xl glass-card-hover hover:bg-white/5 transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-gold-500 font-semibold text-sm">
                    {course.Subject} {course.Number}
                  </span>
                  <p className="text-white text-sm mt-0.5">{course.Title || '—'}</p>
                </div>
                <span className="text-charcoal-400 text-xs shrink-0 ml-2">
                  {course.CreditHours || 3} cr
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Upload({ onUpload, onAddManually, isLoading, loadingMessage, error, setError, searchCourses }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showSearch, setShowSearch] = useState(false);

  // Cycle loading step visuals
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [isLoading]);

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file && file.type === 'application/pdf') {
        setError(null);
        onUpload(file);
      } else {
        setError('Please upload a PDF file.');
      }
    },
    [onUpload, setError]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    onDropRejected: () => setIsDragActive(false),
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isLoading,
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-center mb-12 max-w-2xl"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center">
            <span className="text-charcoal-950 font-black text-sm">B</span>
          </div>
          <span className="text-gold-500 font-bold text-xl tracking-tight">BoilerGPA</span>
        </motion.div>

        <h1 className="text-5xl md:text-6xl font-black leading-tight mb-4">
          <span className="text-white">Know exactly</span>
          <br />
          <span className="gold-shimmer">where you stand.</span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-charcoal-300 text-lg leading-relaxed"
        >
          Upload your syllabus. Enter your grades.
          <br />
          We'll tell you where you'll end up — including the curve.
        </motion.p>
      </motion.div>

      {/* Upload Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-10 text-center"
            >
              {/* Spinner */}
              <div className="flex justify-center mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 rounded-full border-2 border-charcoal-700 border-t-gold-500"
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={loadingStep}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-2"
                >
                  <span className="text-2xl">{LOADING_STEPS[loadingStep].icon}</span>
                  <p className="text-white font-medium">{LOADING_STEPS[loadingStep].text}</p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-6 flex justify-center gap-1.5">
                {LOADING_STEPS.map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: i === loadingStep ? 1 : 0.3 }}
                    className="w-1.5 h-1.5 rounded-full bg-gold-500"
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                {...getRootProps()}
                animate={{
                  scale: isDragActive ? 1.02 : 1,
                  borderColor: isDragActive
                    ? 'rgba(207, 185, 145, 0.7)'
                    : 'rgba(207, 185, 145, 0.2)',
                  boxShadow: isDragActive
                    ? '0 0 40px rgba(207, 185, 145, 0.2)'
                    : '0 0 0px rgba(207, 185, 145, 0)',
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="glass-card p-10 text-center cursor-pointer border-2 border-dashed"
                style={{
                  borderColor: isDragActive
                    ? 'rgba(207, 185, 145, 0.7)'
                    : 'rgba(207, 185, 145, 0.2)',
                }}
              >
                <input {...getInputProps()} />

                <motion.div
                  animate={{ y: isDragActive ? -4 : 0 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="mb-4"
                >
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </motion.div>

                <h3 className="text-white font-semibold text-lg mb-2">
                  {isDragActive ? 'Drop it here' : 'Upload your syllabus'}
                </h3>
                <p className="text-charcoal-400 text-sm mb-4">
                  Drag & drop a PDF, or click to browse
                </p>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-charcoal-400 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  PDF only · Parsed locally by Claude AI
                </div>
              </motion.div>

              {/* Manual entry link */}
              <div className="text-center mt-4">
                <button
                  onClick={() => setShowSearch(true)}
                  className="text-charcoal-400 hover:text-gold-500 text-sm transition-colors underline underline-offset-2"
                >
                  No PDF? Enter your course manually →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            >
              <div className="flex gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Tagline footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 text-charcoal-600 text-xs text-center"
      >
        Powered by Claude AI · Curve data from BoilerGrades (MIT) · Built for Purdue
      </motion.p>

      {/* Search modal */}
      <AnimatePresence>
        {showSearch && (
          <CourseSearchModal
            onSelect={(course) => {
              setShowSearch(false);
              onAddManually(course);
            }}
            onClose={() => setShowSearch(false)}
            searchCourses={searchCourses}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
