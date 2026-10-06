import { describe, expect, it } from 'vitest';
import { isStale } from '../../src/domain/staleness.js';

const current = {
  currentGuidelineVersionId: 'guideline-v2',
  currentApplicationVersionId: 'application-v3',
};

describe('isStale', () => {
  it('reports NO_RUN when there is no analysis run', () => {
    expect(isStale(current, null)).toEqual({
      stale: true,
      reasons: ['NO_RUN'],
    });
  });

  it('reports a changed guideline only', () => {
    expect(isStale(current, {
      guidelineVersionId: 'guideline-v1',
      applicationVersionId: 'application-v3',
    })).toEqual({ stale: true, reasons: ['GUIDELINE_CHANGED'] });
  });

  it('reports a changed application only', () => {
    expect(isStale(current, {
      guidelineVersionId: 'guideline-v2',
      applicationVersionId: 'application-v2',
    })).toEqual({ stale: true, reasons: ['APPLICATION_CHANGED'] });
  });

  it('reports both document changes and returns fresh runs without reasons', () => {
    expect(isStale(current, {
      guidelineVersionId: 'guideline-v1',
      applicationVersionId: 'application-v2',
    })).toEqual({
      stale: true,
      reasons: ['GUIDELINE_CHANGED', 'APPLICATION_CHANGED'],
    });
    expect(isStale(current, {
      guidelineVersionId: 'guideline-v2',
      applicationVersionId: 'application-v3',
    })).toEqual({ stale: false, reasons: [] });
  });
});
