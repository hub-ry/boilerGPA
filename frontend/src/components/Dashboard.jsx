/**
 * Dashboard — main view
 * Semester tabs → course grid → GPA summary
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard, calcLocalGPA, calcSemesterGPA, calcCumulativeGPA, SEMESTER_OPTIONS } from '../hooks/useDashboard';
import CourseCard from './CourseCard';
import AddCourseModal from './AddCourseModal';
import CourseDetailModal from './CourseDetailModal';
import ExportImportModal from './ExportImportModal';

function CurvedGPADisplay({ predictedGPA }) {
  return (
    <div>
      <span className="text-charcoal-400 text-xs block">w/ curve</span>
      <p className="text-2xl font-black text-gold-500 leading-none">
        {predictedGPA.toFixed(2)}
        <span className="text-gold-500/50 text-sm ml-0.5">↑</span>
      </p>
    </div>
  );
}

function GPAPill({ semGPA, predictedResult }) {
  const predGPA = predictedResult?.predicted_gpa;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="hidden sm:flex items-center gap-3 px-4 py-1.5 rounded-full glass-card text-sm"
    >
      <span className="text-charcoal-400">GPA</span>
      <span className="text-white font-bold">{semGPA.toFixed(2)}</span>
      {predGPA != null && (
        <>
          <span className="text-charcoal-700">|</span>
          <span className="text-gold-500 font-bold">{predGPA.toFixed(2)}</span>
          <span className="text-gold-500/50 text-xs">curved</span>
        </>
      )}
    </motion.div>
  );
}

function CumulativeGPACard({ priorQP, priorHours, onChangeQP, onChangeHours, semGPA, cumulativeGPA }) {
  const [open, setOpen] = useState(false);
  const hasPrior = priorQP !== '' && priorHours !== '';

  const semQP = semGPA !== null
    ? null   // we show it qualitatively, not raw QP
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card mb-6"
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-charcoal-300 text-sm font-medium">Cumulative GPA</span>
          {cumulativeGPA !== null ? (
            <span className="text-white font-bold text-lg leading-none">{cumulativeGPA.toFixed(2)}</span>
          ) : (
            <span className="text-charcoal-600 text-sm">enter GPA hours &amp; quality points to project</span>
          )}
        </div>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-charcoal-500 shrink-0"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      {/* Expanded inputs */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 border-t border-white/[0.06] pt-3">
              <p className="text-charcoal-500 text-xs mb-3">
                From your Purdue transcript — look at the <span className="text-charcoal-300">Cumulative</span> row.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-charcoal-500 text-xs block mb-1.5">GPA Hours</label>
                  <input
                    type="number"
                    min="0" step="0.5"
                    value={priorHours}
                    onChange={(e) => onChangeHours(e.target.value)}
                    placeholder="e.g. 60"
                    className="input-field w-full px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-charcoal-500 text-xs block mb-1.5">Quality Points</label>
                  <input
                    type="number"
                    min="0" step="0.1"
                    value={priorQP}
                    onChange={(e) => onChangeQP(e.target.value)}
                    placeholder="e.g. 205.2"
                    className="input-field w-full px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* Live projection */}
              {cumulativeGPA !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 px-3 py-2.5 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-between"
                >
                  <span className="text-charcoal-500 text-xs">
                    {parseFloat(priorQP).toFixed(1)} QP + {parseFloat(priorHours).toFixed(0)} hrs
                    {semGPA !== null && ' + this semester'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-charcoal-400 text-xs">projected</span>
                    <span className="text-white font-bold text-base">{cumulativeGPA.toFixed(2)}</span>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const LETTER_COLOR = (l) => {
  if (!l || l === '—') return 'text-charcoal-400';
  if (l.startsWith('A')) return 'text-green-400';
  if (l.startsWith('B')) return 'text-gold-500';
  if (l.startsWith('C')) return 'text-yellow-500';
  return 'text-red-400';
};

export default function Dashboard() {
  const dash = useDashboard();
  const {
    semesters, activeSemester, setActiveSemester, addSemester,
    courses, addCourse, removeCourse, updateCourse,
    updateCategory, updateAssignmentScore, toggleEntryMode,
    addCategory, removeCategory, reorderCategories,
    parseSyllabus, searchCourses, fetchTemplate,
    priorQP, setPriorQP, priorHours, setPriorHours,
    isLoading, error, setError,
    predictedResult,
    exportData, importData,
  } = dash;

  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [showAddSemester, setShowAddSemester] = useState(false);
  const [newSemInput, setNewSemInput] = useState('');
  const [detailCourseId, setDetailCourseId] = useState(null);

  const semesterList = Object.keys(semesters);
  const semGPA = calcSemesterGPA(courses);
  const cumulativeGPA = calcCumulativeGPA(courses, priorQP, priorHours);
  const detailCourse = courses.find((c) => c.id === detailCourseId) || null;

  const handleAddSemester = () => {
    const name = newSemInput.trim();
    if (!name) return;
    addSemester(name);
    setNewSemInput('');
    setShowAddSemester(false);
  };

  return (
    <div className="min-h-screen bg-charcoal-950">

      <div className="relative z-10 max-w-5xl mx-auto px-4 pt-8 pb-16">

        {/* ── Top nav ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gold-500 flex items-center justify-center shrink-0">
              <span className="text-charcoal-950 font-black text-xs">B</span>
            </div>
            <span className="text-gold-500 font-bold text-lg tracking-tight">BoilerGPA</span>
          </div>

          <div className="flex items-center gap-2">
            {/* GPA pill */}
            {semGPA !== null && (
              <GPAPill semGPA={semGPA} predictedResult={predictedResult} />
            )}
            {/* Export / Import */}
            <button
              onClick={() => setShowExportImport(true)}
              title="Export / Import data"
              className="glass-card p-2 rounded-xl text-charcoal-500 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Semester tabs ── */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none">
          {semesterList.map((sem) => (
            <button
              key={sem}
              onClick={() => setActiveSemester(sem)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                sem === activeSemester
                  ? 'bg-gold-500 text-charcoal-950 font-bold'
                  : 'glass-card text-charcoal-400 hover:text-white'
              }`}
            >
              {sem}
            </button>
          ))}

          {/* Add semester */}
          <AnimatePresence>
            {showAddSemester ? (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-1 shrink-0"
              >
                <select
                  className="input-field px-2 py-1.5 text-sm rounded-xl"
                  value={newSemInput}
                  onChange={(e) => setNewSemInput(e.target.value)}
                >
                  <option value="">Pick semester…</option>
                  {SEMESTER_OPTIONS.filter((s) => !semesters[s]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddSemester}
                  disabled={!newSemInput}
                  className="gold-btn px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddSemester(false); setNewSemInput(''); }}
                  className="text-charcoal-500 hover:text-white px-1"
                >
                  ✕
                </button>
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowAddSemester(true)}
                className="shrink-0 px-3 py-2 rounded-xl text-charcoal-500 hover:text-white glass-card hover:border-gold-500/30 transition-all text-sm"
              >
                + Semester
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── GPA summary bar (mobile) ── */}
        {semGPA !== null && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="sm:hidden glass-card px-4 py-3 mb-4 flex items-center justify-between"
          >
            <span className="text-charcoal-400 text-sm">Semester GPA</span>
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-lg">{semGPA.toFixed(2)}</span>
              {predictedResult?.predicted_gpa != null && (
                <span className="text-gold-500 font-bold text-lg">{predictedResult.predicted_gpa.toFixed(2)}</span>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Cumulative GPA card ── */}
        <CumulativeGPACard
          priorQP={priorQP}
          priorHours={priorHours}
          onChangeQP={setPriorQP}
          onChangeHours={setPriorHours}
          semGPA={semGPA}
          cumulativeGPA={cumulativeGPA}
        />

        {/* ── Course grid ── */}
        {courses.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center py-24"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gold-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">No courses yet</h3>
            <p className="text-charcoal-500 text-sm mb-6">
              Add a course by uploading your syllabus or searching manually.
            </p>
            <button
              onClick={() => setShowAddCourse(true)}
              className="gold-btn px-6 py-3 text-sm"
            >
              Add Your First Course
            </button>
          </motion.div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <AnimatePresence mode="popLayout">
                {courses.map((course, i) => {
                  const gradeInfo = calcLocalGPA(course);
                  const prediction = predictedResult?.courses?.[i] ?? null;
                  return (
                    <CourseCard
                      key={course.id}
                      course={course}
                      gradeInfo={gradeInfo}
                      index={i}
                      prediction={prediction}
                      onClick={() => setDetailCourseId(course.id)}
                    />
                  );
                })}
              </AnimatePresence>

              {/* Add course tile */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddCourse(true)}
                className="glass-card glass-card-hover min-h-[140px] flex flex-col items-center justify-center gap-2
                           text-charcoal-500 hover:text-white transition-colors border-dashed"
                style={{ borderStyle: 'dashed' }}
              >
                <div className="w-10 h-10 rounded-xl border border-gold-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gold-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium">Add Course</span>
              </motion.button>
            </div>

            {/* Semester summary */}
            {courses.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">{activeSemester} Summary</h3>
                  {semGPA !== null && (
                    <div className="text-right flex items-end gap-4">
                      <div>
                        <span className="text-charcoal-400 text-xs block">Raw GPA</span>
                        <p className="text-2xl font-black text-white leading-none">{semGPA.toFixed(2)}</p>
                      </div>
                      {predictedResult?.predicted_gpa != null && (
                        <CurvedGPADisplay
                          predictedGPA={predictedResult.predicted_gpa}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {courses.map((course, i) => {
                    const { letter, weightedScore } = calcLocalGPA(course);
                    const pred = predictedResult?.courses?.[i];
                    const hasCurve = pred?.curve_applied > 0;
                    return (
                      <div key={course.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                        <div className="flex items-center gap-3">
                          {course.course_code && (
                            <span className="text-gold-500 font-bold text-xs bg-gold-500/10 px-2 py-0.5 rounded">
                              {course.course_code}
                            </span>
                          )}
                          <span className="text-charcoal-300 text-sm truncate max-w-[160px]">{course.course_name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {weightedScore !== null && (
                            <span className="text-charcoal-500 text-xs">{weightedScore}%</span>
                          )}
                          <span className={`font-bold text-sm ${LETTER_COLOR(letter)}`}>{letter}</span>
                          {hasCurve && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-gold-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="font-bold text-sm text-gold-400">{pred.predicted_letter}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Error toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                         bg-red-500/20 border border-red-500/30 text-red-300 text-sm max-w-sm text-center"
            >
              {error}
              <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200">✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showExportImport && (
          <ExportImportModal
            onClose={() => setShowExportImport(false)}
            exportData={exportData}
            importData={importData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddCourse && (
          <AddCourseModal
            onClose={() => { setShowAddCourse(false); setError(null); }}
            onSave={(courseData) => {
              addCourse(courseData);
              setShowAddCourse(false);
            }}
            onSaveBulk={(coursesData) => {
              coursesData.forEach(addCourse);
            }}
            parseSyllabus={parseSyllabus}
            searchCourses={searchCourses}
            fetchTemplate={fetchTemplate}
            isLoading={isLoading}
            error={error}
            setError={setError}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailCourse && (
          <CourseDetailModal
            course={detailCourse}
            onClose={() => setDetailCourseId(null)}
            onUpdate={(updates) => updateCourse(detailCourse.id, updates)}
            onUpdateCategory={(catIdx, updates) => updateCategory(detailCourse.id, catIdx, updates)}
            onUpdateAssignment={(catIdx, scoreIdx, val) => updateAssignmentScore(detailCourse.id, catIdx, scoreIdx, val)}
            onToggleEntryMode={(catIdx) => toggleEntryMode(detailCourse.id, catIdx)}
            onAddCategory={() => addCategory(detailCourse.id)}
            onRemoveCategory={(catIdx) => removeCategory(detailCourse.id, catIdx)}
            onReorderCategories={(oldIdx, newIdx) => reorderCategories(detailCourse.id, oldIdx, newIdx)}
            onRemoveCourse={() => { removeCourse(detailCourse.id); setDetailCourseId(null); }}
            activeSemester={activeSemester}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
