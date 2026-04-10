'use client';

import { useState, useEffect } from 'react';
import { useCourseInfo } from '@/lib/useCourseInfo';

const EMPTY_CATEGORY = () => ({
  name: '',
  weight: '',
  count: 1,
  completed: false,
  entryMode: 'average',
  score: null,
  scores: [],
  classStats: [null], // one slot per item
});

function ManualForm({ onCourseExtracted, onCancel }) {
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const courseInfo = useCourseInfo(courseCode);

  useEffect(() => {
    if (courseInfo.creditHours != null) setCreditHours(courseInfo.creditHours);
    if (courseInfo.title && !courseName) setCourseName(courseInfo.title);
  }, [courseInfo.creditHours, courseInfo.title]);
  const [categories, setCategories] = useState([EMPTY_CATEGORY()]);
  const [error, setError] = useState(null);

  const updateCategory = (i, field, value) => {
    setCategories(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const addCategory = () => setCategories(prev => [...prev, EMPTY_CATEGORY()]);

  const removeCategory = (i) =>
    setCategories(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!courseName.trim()) {
      setError('Course name is required');
      return;
    }

    const filledCats = categories.filter(c => c.name.trim() && c.weight !== '');
    if (filledCats.length === 0) {
      setError('Add at least one grading category');
      return;
    }

    const totalWeight = filledCats.reduce((sum, c) => sum + Number(c.weight), 0);
    if (Math.abs(totalWeight - 100) > 0.5) {
      setError(`Weights must sum to 100% (currently ${totalWeight.toFixed(1)}%)`);
      return;
    }

    onCourseExtracted({
      course_name: courseName.trim(),
      course_code: courseCode.trim().replace(/[\s\-_]+/g, '').toUpperCase(),
      instructor: instructor.trim() || 'Staff',
      credit_hours: Number(creditHours) || 3, // fallback if lookup failed
      grading_scale: { A: 90, B: 80, C: 70, D: 60 },
      categories: filledCats.map(c => {
        const count = Number(c.count) || 1;
        return {
          name: c.name.trim(),
          weight: Number(c.weight),
          count,
          completed: false,
          entryMode: count > 1 ? 'individual' : 'average',
          score: null,
          scores: Array(count).fill(''),
          classStats: Array(count).fill(null),
        };
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Course info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-charcoal-300 mb-1">
            Course Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={courseName}
            onChange={e => setCourseName(e.target.value)}
            placeholder="e.g., Data Structures"
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm text-charcoal-300 mb-1">
            Course Code
          </label>
          <input
            type="text"
            value={courseCode}
            onChange={e => setCourseCode(e.target.value.toUpperCase())}
            placeholder="e.g., CS25100"
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm text-charcoal-300 mb-1">Instructor</label>
          <input
            type="text"
            value={instructor}
            onChange={e => setInstructor(e.target.value)}
            placeholder="e.g., Smith"
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm text-charcoal-300 mb-1 flex items-center gap-2">
            Credit Hours
            {courseInfo.loading && <span className="text-xs text-charcoal-500">looking up…</span>}
            {!courseInfo.loading && courseInfo.found === true && (
              <span className="text-xs text-green-400">from Purdue catalog</span>
            )}
            {!courseInfo.loading && courseInfo.found === false && courseCode.length >= 4 && (
              <span className="text-xs text-charcoal-500">not found — enter manually</span>
            )}
          </label>
          <input
            type="number"
            min="1"
            max="6"
            value={creditHours}
            onChange={e => setCreditHours(e.target.value)}
            placeholder="3"
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white focus:outline-none focus:border-gold-500"
          />
        </div>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-charcoal-300">
            Grading Categories <span className="text-red-400">*</span>
          </label>
          <span className="text-xs text-charcoal-500">Must sum to 100%</span>
        </div>
        <div className="space-y-2">
          {categories.map((cat, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={cat.name}
                onChange={e => updateCategory(i, 'name', e.target.value)}
                placeholder="Name (e.g., Homework)"
                className="flex-1 px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500 text-sm"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={cat.weight}
                onChange={e => updateCategory(i, 'weight', e.target.value)}
                placeholder="%"
                className="w-20 px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500 text-sm text-center"
              />
              <input
                type="number"
                min="1"
                max="50"
                value={cat.count}
                onChange={e => updateCategory(i, 'count', e.target.value)}
                title="Number of items"
                placeholder="#"
                className="w-16 px-2 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-white placeholder-charcoal-500 focus:outline-none focus:border-gold-500 text-sm text-center"
              />
              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCategory(i)}
                  className="text-charcoal-500 hover:text-red-400 transition-colors px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-charcoal-500 mt-1">
          Name · Weight (%) · Count (#items)
        </p>
        <button
          type="button"
          onClick={addCategory}
          className="mt-3 text-sm text-gold-500 hover:text-gold-400 transition-colors"
        >
          + Add category
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-900/30 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" className="button-primary flex-1">
          Add Course
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="button-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// { name, status: 'pending' | 'parsing' | 'done' | 'error', error? }
function FileStatus({ files }) {
  if (!files.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {files.map(f => (
        <div key={f.name} className="flex items-center gap-3 text-sm">
          {f.status === 'pending'  && <span className="w-4 h-4 rounded-full border border-charcoal-500 flex-shrink-0" />}
          {f.status === 'parsing' && <span className="w-4 h-4 rounded-full border-2 border-gold-500 border-t-transparent animate-spin flex-shrink-0" />}
          {f.status === 'done'    && <span className="w-4 h-4 text-green-400 flex-shrink-0">✓</span>}
          {f.status === 'error'   && <span className="w-4 h-4 text-red-400 flex-shrink-0">✕</span>}
          <span className="text-charcoal-300 truncate flex-1">{f.name}</span>
          {f.status === 'error' && <span className="text-red-400 text-xs">{f.error}</span>}
        </div>
      ))}
    </div>
  );
}

export function SyllabusUpload({ onCourseExtracted }) {
  const [mode, setMode] = useState('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [fileStatuses, setFileStatuses] = useState([]); // [{ name, status, error }]

  const isUploading = fileStatuses.some(f => f.status === 'pending' || f.status === 'parsing');

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.includes('pdf'));
    if (files.length) uploadFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.includes('pdf'));
    if (files.length) uploadFiles(files);
    e.target.value = '';
  };

  const uploadFiles = (files) => {
    const initial = files.map(f => ({ name: f.name, status: 'pending' }));
    setFileStatuses(initial);

    files.forEach((file, i) => {
      setFileStatuses(prev => prev.map((s, j) => j === i ? { ...s, status: 'parsing' } : s));

      const formData = new FormData();
      formData.append('file', file);

      fetch('/api/parse-syllabus', { method: 'POST', body: formData })
        .then(async res => {
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to parse');
          }
          return res.json();
        })
        .then(async ({ data: parsed }) => {
          const code = (parsed.courseCode || '').replace(/[\s\-_]+/g, '').toUpperCase();
          let creditHours = 3;
          if (code) {
            try {
              const info = await fetch(`/api/course-info?code=${encodeURIComponent(code)}`).then(r => r.json());
              if (info.found && info.creditHours) creditHours = info.creditHours;
            } catch {}
          }
          onCourseExtracted({
            course_name: parsed.courseName || parsed.courseCode || 'Untitled',
            course_code: code,
            instructor: parsed.professor || 'Staff',
            credit_hours: creditHours,
            grading_scale: parsed.gradingScale || { A: 90, B: 80, C: 70, D: 60 },
            categories: (parsed.assignments || []).map(a => {
              const count = a.count || 1;
              return {
                name: a.name,
                weight: (a.weight * 100) || 0,
                count,
                completed: false,
                entryMode: count > 1 ? 'individual' : 'average',
                score: null,
                scores: Array(count).fill(''),
                classStats: Array(count).fill(null),
              };
            }),
          });
          setFileStatuses(prev => prev.map((s, j) => j === i ? { ...s, status: 'done' } : s));
        })
        .catch(err => {
          setFileStatuses(prev => prev.map((s, j) => j === i ? { ...s, status: 'error', error: err.message } : s));
        });
    });
  };

  const handleManualAdd = (courseData) => {
    onCourseExtracted(courseData);
    setMode('idle');
  };

  if (mode === 'manual') {
    return (
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Add Course Manually</h3>
        </div>
        <ManualForm onCourseExtracted={handleManualAdd} onCancel={() => setMode('idle')} />
      </div>
    );
  }

  return (
    <div className="glass-card p-8">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded p-12 text-center transition-colors ${
          isDragging
            ? 'border-gold-500 bg-gold-500/10'
            : 'border-charcoal-500 bg-charcoal-800/30'
        }`}
      >
        <svg
          className="w-12 h-12 mx-auto text-gold-500 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-white font-semibold mb-2">Drag your syllabus PDFs here</p>
        <p className="text-charcoal-400 text-sm mb-4">
          Drop multiple files — Claude will parse each one
        </p>
        <input
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
          id="pdf-input"
        />
        <label
          htmlFor="pdf-input"
          className="inline-block button-primary cursor-pointer"
        >
          {isUploading ? 'Parsing…' : 'Select PDFs'}
        </label>
      </div>

      <FileStatus files={fileStatuses} />

      {/* Divider + manual option */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-charcoal-700" />
        <span className="text-charcoal-500 text-sm">or</span>
        <div className="flex-1 h-px bg-charcoal-700" />
      </div>
      <button
        type="button"
        onClick={() => setMode('manual')}
        className="mt-4 w-full button-secondary text-sm"
      >
        Add course manually
      </button>
    </div>
  );
}
