import { describe, expect, it } from 'vitest';
import { levelSignal, normalise, verifyEvidence, verifyQuote } from '../../src/domain/citations.js';

describe('citation verification', () => {
  const segments = [{
    id: 'S1',
    text: 'Applicants must submit “audited—annual accounts” before the deadline.',
  }];

  it('normalises case, whitespace, quotes, and dashes without fuzzy matching', () => {
    expect(normalise('  “Audited—Annual   Accounts” ')).toBe('"audited-annual accounts"');
    expect(verifyQuote(segments, 'S1', '"AUDITED-ANNUAL ACCOUNTS"')).toBe(true);
    expect(verifyQuote(segments, 'S1', 'audited annual accounts')).toBe(false);
  });

  it('requires a known segment and at least twelve normalised quote characters', () => {
    expect(verifyQuote(segments, 'S2', 'Applicants must submit audited annual accounts')).toBe(false);
    expect(verifyQuote(segments, 'S1', 'accounts')).toBe(false);
  });

  it('marks individual evidence and reports if all citations are verified', () => {
    const result = verifyEvidence(segments, [
      { segmentId: 'S1', quote: 'Applicants must submit' },
      { segmentId: 'S9', quote: 'Applicants must submit' },
    ]);
    expect(result.evidence.map(({ verified }) => verified)).toEqual([true, false]);
    expect(result.allVerified).toBe(false);
    expect(verifyEvidence(segments, []).allVerified).toBe(false);
  });
});

describe('levelSignal', () => {
  it.each([
    ['Applicants must be registered.', 'MANDATORY'],
    ['Late submissions will not be considered.', 'MANDATORY'],
    ['Ineligible entities cannot apply.', 'MANDATORY'],
    ['Applicants should include a work plan.', 'RECOMMENDED'],
    ['A budget is preferred.', 'RECOMMENDED'],
    ['The program serves local communities.', 'NEUTRAL'],
  ])('%s is %s', (quote, expected) => {
    expect(levelSignal(quote)).toBe(expected);
  });
});
