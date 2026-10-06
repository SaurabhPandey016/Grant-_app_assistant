/**
 * @typedef {'GUIDELINE_CHANGED' | 'APPLICATION_CHANGED' | 'NO_RUN'} StalenessReason
 * @typedef {{ stale: boolean, reasons: StalenessReason[] }} Staleness
 * @typedef {{ currentGuidelineVersionId: string | null, currentApplicationVersionId: string | null }} CurrentVersions
 * @typedef {{ guidelineVersionId: string, applicationVersionId: string } | null | undefined} AnalysisVersion
 */

/**
 * @param {CurrentVersions} current
 * @param {AnalysisVersion} run
 * @returns {Staleness}
 */
export function isStale(current, run) {
  if (!run) {
    return { stale: true, reasons: ['NO_RUN'] };
  }

  const reasons = [];
  if (current.currentGuidelineVersionId !== run.guidelineVersionId) {
    reasons.push('GUIDELINE_CHANGED');
  }
  if (current.currentApplicationVersionId !== run.applicationVersionId) {
    reasons.push('APPLICATION_CHANGED');
  }

  return { stale: reasons.length > 0, reasons };
}
