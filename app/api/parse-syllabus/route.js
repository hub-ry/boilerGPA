/**
 * app/api/parse-syllabus/route.js
 * Syllabus PDF parsing endpoint
 * - Accepts PDF file + course code
 * - Checks Vercel KV cache first
 * - If miss: extracts text via pdf-parse, sends to Claude
 * - Caches result for 30 days
 */

import { parseWithClaude, normalizeClaudeResponse } from '@/lib/claude.js';
import { getCachedSyllabus, cacheSyllabus } from '@/lib/kv.js';
import PDFParser from 'pdf-parse';

export const dynamic = 'force-dynamic';

/**
 * Extract text from PDF using pdf-parse.
 * Returns first ~20 pages worth of text.
 */
async function extractTextFromPDF(buffer) {
  try {
    const data = await PDFParser(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const courseCode = formData.get('courseCode') || '';

    // Validate input
    if (!file) {
      return Response.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!file.type.includes('pdf')) {
      return Response.json(
        { success: false, error: 'Only PDF files are accepted' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return Response.json(
        { success: false, error: 'File is empty' },
        { status: 400 }
      );
    }

    if (buffer.byteLength > 10 * 1024 * 1024) {
      return Response.json(
        { success: false, error: 'File is too large (max 10MB)' },
        { status: 400 }
      );
    }

    // Check cache first (if course code provided)
    if (courseCode) {
      const cached = await getCachedSyllabus(courseCode);
      if (cached) {
        return Response.json({
          success: true,
          data: cached,
          fromCache: true,
        });
      }
    }

    // Extract PDF text
    const pdfText = await extractTextFromPDF(Buffer.from(buffer));

    if (!pdfText.trim()) {
      return Response.json(
        { success: false, error: 'Could not extract text from PDF' },
        { status: 400 }
      );
    }

    // Parse with Claude
    const parsed = await parseWithClaude(pdfText);
    const normalized = normalizeClaudeResponse(parsed);

    // Cache the result (if we have a course code)
    if (courseCode) {
      await cacheSyllabus(courseCode, normalized);
    }

    return Response.json({
      success: true,
      data: normalized,
      fromCache: false,
    });
  } catch (error) {
    console.error('Parse syllabus error:', error);
    return Response.json(
      { success: false, error: error.message || 'Failed to parse syllabus' },
      { status: 500 }
    );
  }
}
