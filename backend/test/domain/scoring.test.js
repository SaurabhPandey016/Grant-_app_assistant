import { describe, expect, it } from 'vitest';
import {
  aiSuggestedSatisfied,
  confirmedSatisfied,
  computeCompletion,
  effectiveLevel,
  effectiveStatus,
  isSatisfied,
} from '../../src/domain/scoring.js';

function mapping(overrides = {}) {
  return {
    aiStatus: 'SUPPORTED',
    allVerified: true,
    reviewDecision: 'PENDING',
    reviewerStatus: null,
    evidence: [{ verified: true }],
    ...overrides,
  };
}

describe('effectiveStatus', () => {
  it.each([
    ['REJECTED', 'SUPPORTED', null, 'MISSING'],
    ['CORRECTED', 'MISSING', 'SUPPORTED', 'SUPPORTED'],
    ['CORRECTED', 'SUPPORTED', 'PARTIAL', 'PARTIAL'],
    ['CONFIRMED', 'SUPPORTED', null, 'SUPPORTED'],
    ['PENDING', 'AMBIGUOUS', null, 'AMBIGUOUS'],
  ])('%s with AI %s and reviewer %s yields %s', (decision, aiStatus, reviewerStatus, expected) => {
    expect(effectiveStatus(mapping({
      reviewDecision: decision,
      aiStatus,
      reviewerStatus,
    }))).toBe(expected);
  });

  it('treats an invalid missing corrected status as missing', () => {
    expect(effectiveStatus(mapping({ reviewDecision: 'CORRECTED', reviewerStatus: null })))
      .toBe('MISSING');
  });
});

describe('satisfaction', () => {
  it('requires verified evidence for confirmed or pending AI suggestions', () => {
    expect(isSatisfied(mapping({ reviewDecision: 'PENDING', allVerified: false }))).toBe(false);
    expect(isSatisfied(mapping({ reviewDecision: 'CONFIRMED', allVerified: false }))).toBe(false);
    expect(isSatisfied(mapping({ reviewDecision: 'PENDING', allVerified: true }))).toBe(true);
    expect(aiSuggestedSatisfied(mapping())).toBe(true);
    expect(aiSuggestedSatisfied(mapping({ reviewDecision: 'CONFIRMED' }))).toBe(false);
  });

  it('allows reviewer-corrected support, but rejected review never satisfies', () => {
    const corrected = mapping({
      reviewDecision: 'CORRECTED',
      reviewerStatus: 'SUPPORTED',
      allVerified: false,
    });
    expect(isSatisfied(corrected)).toBe(true);
    expect(confirmedSatisfied(corrected)).toBe(true);
    expect(isSatisfied(mapping({ reviewDecision: 'REJECTED' }))).toBe(false);
    expect(confirmedSatisfied(mapping({
      reviewDecision: 'CONFIRMED',
      allVerified: true,
    }))).toBe(true);
  });
});

describe('completion scoring', () => {
  it('applies level overrides and separates confirmed counts from pending suggestions', () => {
    const requirements = [
      {
        code: 'R1', text: 'A', aiLevel: 'MANDATORY', levelOverride: 'RECOMMENDED',
        mapping: mapping({ reviewDecision: 'CORRECTED', reviewerStatus: 'SUPPORTED' }),
      },
      {
        code: 'R2', text: 'B', aiLevel: 'RECOMMENDED', levelOverride: 'MANDATORY',
        mapping: mapping(),
      },
    ];
    const result = computeCompletion(requirements, []);
    expect(result.mandatory).toEqual({
      total: 1,
      confirmedMet: 0,
      aiSuggestedMet: 1,
      percentConfirmed: 0,
      percentWithSuggestions: 100,
    });
    expect(result.recommended.confirmedMet).toBe(1);
    expect(result.outstandingMandatory).toEqual([{ code: 'R2', text: 'B' }]);
    expect(result.label).toBe('0 of 1 mandatory requirements confirmed');
  });

  it('counts zero-requirement levels without divide-by-zero results', () => {
    const result = computeCompletion([], []);
    expect(result.mandatory.percentConfirmed).toBe(0);
    expect(result.recommended.percentWithSuggestions).toBe(0);
    expect(result.label).toBe('0 of 0 mandatory requirements confirmed');
  });

  it('reports missing metadata and required documents without a matching provided document', () => {
    const result = computeCompletion([
      {
        code: 'R1',
        text: 'Provide audited accounts.',
        aiLevel: 'MANDATORY',
        needsDocument: true,
        documentType: 'Audited accounts',
        sourceVerified: false,
        mapping: mapping({
          allVerified: false,
          evidence: [{ verified: false }, { verified: true }],
        }),
      },
      {
        code: 'R2',
        text: 'Provide registration.',
        aiLevel: 'MANDATORY',
        needsDocument: true,
        documentType: 'Registration certificate',
        mapping: mapping(),
      },
    ], [
      { name: 'Accounts statement', docType: 'Audited accounts', status: 'MISSING' },
      { name: 'Certificate', docType: 'REGISTRATION_CERTIFICATE', status: 'PROVIDED' },
    ]);
    expect(result.missingDocuments).toEqual([
      { name: 'Accounts statement', docType: 'Audited accounts', requirementCode: 'R1' },
    ]);
    expect(result.unverifiedCitationCount).toBe(2);
  });

  it('falls back to the AI level when there is no override', () => {
    expect(effectiveLevel({ aiLevel: 'MANDATORY', levelOverride: null })).toBe('MANDATORY');
  });
});
