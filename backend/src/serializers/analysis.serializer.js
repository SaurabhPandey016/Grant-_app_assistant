/**
 * @param {object} run
 */
export function serializeAnalysisRun(run) {
  return {
    id: run.id,
    assessmentId: run.assessmentId,
    guidelineVersionId: run.guidelineVersionId,
    applicationVersionId: run.applicationVersionId,
    status: run.status,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    error: run.error ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };
}

/**
 * @param {object} result
 */
export function serializeAnalysisResult(result) {
  const mappingsByCode = new Map(
    result.mappings.map((mapping) => [mapping.requirementCode, mapping]),
  );
  return {
    run: serializeAnalysisRun(result.run),
    provider: result.run.provider,
    aiUnavailable: result.aiUnavailable,
    requirements: result.requirements.map((requirement) => ({
      code: requirement.code,
      text: requirement.text,
      category: requirement.category,
      aiLevel: requirement.level,
      levelDisputed: requirement.levelDisputed,
      sourceSegmentId: requirement.sourceSegmentId,
      sourceQuote: requirement.sourceQuote,
      sourceVerified: requirement.sourceVerified,
      needsDocument: requirement.needsDocument,
      documentType: requirement.documentType,
      mapping: serializeMapping(mappingsByCode.get(requirement.code)),
    })),
    questions: result.questions,
    unsupportedClaims: result.unsupportedClaims,
  };
}

/**
 * @param {object} result
 */
export function serializeLatestAnalysis(result) {
  return {
    run: serializeAnalysisRun(result),
    requirements: result.requirements.map((requirement) => ({
      id: requirement.id,
      code: requirement.code,
      text: requirement.text,
      category: requirement.category,
      aiLevel: requirement.aiLevel,
      levelOverride: requirement.levelOverride,
      levelDisputed: requirement.levelDisputed,
      sourceSegmentId: requirement.sourceSegmentId,
      sourceQuote: requirement.sourceQuote,
      sourceVerified: requirement.sourceVerified,
      needsDocument: requirement.needsDocument,
      documentType: requirement.documentType,
      mapping: requirement.mapping ? serializeMapping({
        ...requirement.mapping,
        status: requirement.mapping.aiStatus,
        requirementCode: requirement.code,
      }) : null,
    })),
    questions: result.clarificationQuestions,
    unsupportedClaims: result.unsupportedClaims,
  };
}

function serializeMapping(mapping) {
  if (!mapping) return null;
  return {
    id: mapping.id,
    requirementCode: mapping.requirementCode,
    aiStatus: mapping.status ?? mapping.aiStatus,
    rationale: mapping.rationale,
    evidence: mapping.evidence,
    allVerified: mapping.allVerified,
    reviewDecision: mapping.reviewDecision ?? 'PENDING',
    reviewerStatus: mapping.reviewerStatus ?? null,
    reviewerEvidence: mapping.reviewerEvidence ?? null,
    reviewerNote: mapping.reviewerNote ?? null,
    reviewedAt: mapping.reviewedAt ?? null,
  };
}
