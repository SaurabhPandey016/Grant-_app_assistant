import { AppError } from '../middleware/error-handler.js';

export const MAX_DOCUMENT_CHARS = 200_000;

/**
 * @typedef {{ id: string, text: string, start: number, end: number }} DocumentSegment
 */

/**
 * Splits source text on blank lines, headings, and list-item boundaries.
 * Offsets are half-open indexes into the unmodified source string.
 * @param {string} text
 * @returns {DocumentSegment[]}
 */
export function splitDocument(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Document content must be a string.');
  }

  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new AppError({
      code: 'DOCUMENT_TOO_LARGE',
      message: `Document content must not exceed ${MAX_DOCUMENT_CHARS} characters.`,
      httpStatus: 413,
    });
  }

  const segments = [];
  let pendingStart = null;
  let pendingEnd = null;
  let cursor = 0;

  const flush = () => {
    if (pendingStart === null) {
      return;
    }

    const source = text.slice(pendingStart, pendingEnd);
    const leadingWhitespace = source.length - source.trimStart().length;
    const content = source.trim();
    if (content.length > 0) {
      const start = pendingStart + leadingWhitespace;
      segments.push({
        id: `S${segments.length + 1}`,
        text: content,
        start,
        end: start + content.length,
      });
    }
    pendingStart = null;
    pendingEnd = null;
  };

  while (cursor < text.length) {
    const newline = text.indexOf('\n', cursor);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(cursor, lineEnd);
    const lineContent = line.replace(/\r?\n$/, '');

    if (/^\s*$/.test(lineContent)) {
      flush();
    } else if (/^\s{0,3}#{1,6}\s+/.test(lineContent) || /^\s{0,3}(?:[-+*]\s+|\d+[.)]\s+)/.test(lineContent)) {
      flush();
      pendingStart = cursor;
      pendingEnd = lineEnd;
      flush();
    } else {
      if (pendingStart === null) {
        pendingStart = cursor;
      }
      pendingEnd = lineEnd;
    }

    cursor = lineEnd;
  }

  flush();
  return segments;
}
