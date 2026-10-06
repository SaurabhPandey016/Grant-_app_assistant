import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/middleware/error-handler.js';
import { MAX_DOCUMENT_CHARS, splitDocument } from '../../src/domain/segmenter.js';

describe('splitDocument', () => {
  it('splits paragraphs, markdown headings, and list items with original offsets', () => {
    const source = 'Intro paragraph.\ncontinued.\n\n## Eligibility\n\n- First item\n- Second item\n';
    const segments = splitDocument(source);

    expect(segments.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'S1', text: 'Intro paragraph.\ncontinued.' },
      { id: 'S2', text: '## Eligibility' },
      { id: 'S3', text: '- First item' },
      { id: 'S4', text: '- Second item' },
    ]);
    for (const segment of segments) {
      expect(source.slice(segment.start, segment.end)).toBe(segment.text);
    }
  });

  it('returns no segments for empty or whitespace-only input', () => {
    expect(splitDocument('')).toEqual([]);
    expect(splitDocument(' \r\n\t \n')).toEqual([]);
  });

  it('rejects documents over the configured character limit', () => {
    expect(() => splitDocument('x'.repeat(MAX_DOCUMENT_CHARS + 1))).toThrowError(
      expect.objectContaining({
        name: 'AppError',
        code: 'DOCUMENT_TOO_LARGE',
        httpStatus: 413,
      }),
    );
    expect(() => splitDocument('x'.repeat(MAX_DOCUMENT_CHARS + 1))).toThrow(AppError);
  });

  it('keeps CRLF offsets anchored to the original text', () => {
    const source = '# Title\r\n\r\nFirst\r\n- Item\r\n';
    const segments = splitDocument(source);

    for (const segment of segments) {
      expect(source.slice(segment.start, segment.end)).toBe(segment.text);
    }
    expect(segments.map(({ text }) => text)).toEqual(['# Title', 'First', '- Item']);
  });
});
