/**
 * useGPA — central state management hook for BoilerGPA
 * Manages the multi-step flow: upload → grade entry → results
 */

import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

export const STEPS = {
  LANDING: 'landing',
  GRADE_ENTRY: 'grade_entry',
  RESULTS: 'results',
};

const LOADING_MESSAGES = [
  "Reading your syllabus so you don't have to...",
  "Extracting grading weights...",
  "Parsing assignment categories...",
  "Almost there...",
  "Finalizing course structure...",
];

export function useGPA() {
  const [step, setStep] = useState(STEPS.LANDING);
  const [courses, setCourses] = useState([]);
  const [gpaResult, setGpaResult] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);

  // Cycle through loading messages every 1.5s
  const startLoadingMessages = useCallback(() => {
    let idx = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[idx]);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Parse a PDF syllabus via the backend
  const parseSyllabus = useCallback(async (file) => {
    setIsLoading(true);
    setError(null);
    const stopMessages = startLoadingMessages();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch(`${API_BASE}/parse-syllabus`, {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${resp.status}`);
      }

      const { data } = await resp.json();
      stopMessages();

      // Add the parsed course to the list
      const newCourse = {
        ...data,
        id: Date.now(),
        categories: data.categories.map((cat) => ({
          ...cat,
          score: '',
          completed: true,
        })),
      };

      setCourses((prev) => [...prev, newCourse]);
      setStep(STEPS.GRADE_ENTRY);
    } catch (err) {
      stopMessages();
      setError(err.message || 'Failed to parse syllabus. Please try again or enter manually.');
    } finally {
      setIsLoading(false);
    }
  }, [startLoadingMessages]);

  // Add a course manually (from search)
  const addCourseManually = useCallback((courseData) => {
    const newCourse = {
      course_name: `${courseData.Subject} ${courseData.Number} — ${courseData.Title || 'Unknown'}`,
      course_code: `${courseData.Subject}${courseData.Number}`,
      instructor: 'Staff',
      credit_hours: parseInt(courseData.CreditHours) || 3,
      grading_scale: { A: 90, B: 80, C: 70, D: 60 },
      categories: [
        { name: 'Exams', weight: 60, count: 3, score: '', completed: true },
        { name: 'Homework', weight: 30, count: 10, score: '', completed: true },
        { name: 'Other', weight: 10, count: 1, score: '', completed: true },
      ],
      id: Date.now(),
    };

    setCourses((prev) => [...prev, newCourse]);
    setStep(STEPS.GRADE_ENTRY);
  }, []);

  // Update a specific category's score or completion status
  const updateCategoryScore = useCallback((courseId, categoryIndex, field, value) => {
    setCourses((prev) =>
      prev.map((course) => {
        if (course.id !== courseId) return course;
        const updatedCategories = course.categories.map((cat, idx) => {
          if (idx !== categoryIndex) return cat;
          return { ...cat, [field]: value };
        });
        return { ...course, categories: updatedCategories };
      })
    );
  }, []);

  // Update a course-level field (instructor, credit hours, etc.)
  const updateCourse = useCallback((courseId, field, value) => {
    setCourses((prev) =>
      prev.map((course) =>
        course.id === courseId ? { ...course, [field]: value } : course
      )
    );
  }, []);

  // Remove a course
  const removeCourse = useCallback((courseId) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  }, []);

  // Calculate GPA from current entries
  const calculateGPA = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Calculate current GPA
      const calcResp = await fetch(`${API_BASE}/calculate-gpa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses }),
      });

      if (!calcResp.ok) {
        const err = await calcResp.json().catch(() => ({}));
        throw new Error(err.detail || 'GPA calculation failed');
      }

      const { data: calcData } = await calcResp.json();

      // Predict final GPA
      const predResp = await fetch(`${API_BASE}/predict-gpa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses }),
      });

      if (!predResp.ok) {
        const err = await predResp.json().catch(() => ({}));
        throw new Error(err.detail || 'GPA prediction failed');
      }

      const { data: predData } = await predResp.json();

      setGpaResult(calcData);
      setPredictionResult(predData);
      setStep(STEPS.RESULTS);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [courses]);

  // Search Purdue courses
  const searchCourses = useCallback(async (query) => {
    if (!query || query.length < 2) return [];

    try {
      const resp = await fetch(
        `${API_BASE}/courses/search?q=${encodeURIComponent(query)}`
      );
      if (!resp.ok) return [];
      const { data } = await resp.json();
      return data || [];
    } catch {
      return [];
    }
  }, []);

  // Get what score is needed on a final
  const getScoreNeeded = useCallback(async (courseData) => {
    try {
      const resp = await fetch(`${API_BASE}/what-score-needed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courseData),
      });
      if (!resp.ok) return null;
      const { data } = await resp.json();
      return data;
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setCourses([]);
    setGpaResult(null);
    setPredictionResult(null);
    setError(null);
    setStep(STEPS.LANDING);
  }, []);

  const goBack = useCallback(() => {
    if (step === STEPS.RESULTS) setStep(STEPS.GRADE_ENTRY);
    else if (step === STEPS.GRADE_ENTRY) setStep(STEPS.LANDING);
  }, [step]);

  return {
    step,
    courses,
    gpaResult,
    predictionResult,
    isLoading,
    loadingMessage,
    error,
    setError,
    setStep,
    parseSyllabus,
    addCourseManually,
    updateCategoryScore,
    updateCourse,
    removeCourse,
    calculateGPA,
    searchCourses,
    getScoreNeeded,
    reset,
    goBack,
    STEPS,
  };
}
