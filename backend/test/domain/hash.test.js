import { describe, expect, it } from 'vitest';
import { hashDocumentContent, normalizeDocumentContent } from '../../src/domain/hash.js';

describe('document content hashing', () => {
  it('normalizes line endings and Unicode before hashing', () => {
    expect(hashDocumentContent('\uFEFFcafe\u0301\r\nNext line \r\n'))
      .toBe(hashDocumentContent('café\nNext line'));
  });

  it('produces stable SHA-256 hex digests', () => {
    const digest = hashDocumentContent('Guideline content');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDocumentContent('Guideline content')).toBe(digest);
    expect(normalizeDocumentContent('  A\r\nB  ')).toBe('A\nB');
  });
});
