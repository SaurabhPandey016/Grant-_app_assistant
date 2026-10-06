import { verifyEvidence } from '../domain/citations.js';
import { computeCompletion } from '../domain/scoring.js';
import {
  findMappingReviewContextForUser,
  findCompletionDataForUser,
  reviewMappingForUser,
  updateClaimForUser,
  updateQuestionForUser,
  updateRequirementLevelForUser,
} from '../repositories/analysis.repository.js';
import { isStale } from '../domain/staleness.js';
import { AppError } from '../middleware/error-handler.js';

/**
 * @param {{
 *  repository?: {
 *    findMappingReviewContextForUser: typeof findMappingReviewContextForUser,
 *    reviewMappingForUser: typeof reviewMappingForUser,
 *    updateRequirementLevelForUser: typeof updateRequirementLevelForUser,
 *    updateQuestionForUser: typeof updateQuestionForUser,
 *    updateClaimForUser: typeof updateClaimForUser,
 *    findCompletionDataForUser: typeof findCompletionDataForUser
 *  }
 * }} [dependencies]
 */
export function createReviewService({
  repository = {
    findMappingReviewContextForUser,
    reviewMappingForUser,
    updateRequirementLevelForUser,
    updateQuestionForUser,
    updateClaimForUser,
    findCompletionDataForUser,
  },
} = {}) {
  async function reviewMapping(requirementId, userId, input) {
    const context = await repository.findMappingReviewContextForUser(requirementId, userId);
    if (!context) throw notFound();
    const run = context.requirement.run;
    const evidence = input.evidence === undefined
      ? undefined
      : verifyEvidence(readSegments(run.applicationVersion.segments), input.evidence).evidence;
    const updated = await repository.reviewMappingForUser(requirementId, userId, {
      ...input,
      evidence,
    });
    if (!updated) throw notFound();
    const staleness = isStale(
      run.assessment,
      run,
    );
    return { mapping: updated.mapping, stale: staleness.stale, reasons: staleness.reasons };
  }

  async function updateRequirementLevel(requirementId, userId, levelOverride) {
    const requirement = await repository.updateRequirementLevelForUser(
      requirementId,
      userId,
      levelOverride,
    );
    if (!requirement) throw notFound();
    return requirement;
  }

  async function updateQuestion(questionId, userId, changes) {
    const question = await repository.updateQuestionForUser(questionId, userId, changes);
    if (!question) throw notFound();
    return question;
  }

  async function updateClaim(claimId, userId, reviewDecision) {
    const claim = await repository.updateClaimForUser(claimId, userId, reviewDecision);
    if (!claim) throw notFound();
    return claim;
  }

  async function getCompletion(assessmentId, userId) {
    const data = await repository.findCompletionDataForUser(assessmentId, userId);
    if (!data) throw notFound('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    const latestRun = data.analysisRuns[0] ?? null;
    const requirements = latestRun?.requirements ?? [];
    const staleness = isStale(data, latestRun);
    return {
      ...computeCompletion(requirements, data.supportingDocuments),
      disclaimer: 'This completeness summary is informational and is not an authoritative legal or funding-eligibility decision.',
      run: latestRun ? {
        id: latestRun.id,
        status: latestRun.status,
        guidelineVersionId: latestRun.guidelineVersionId,
        applicationVersionId: latestRun.applicationVersionId,
      } : null,
      stale: staleness.stale,
      reasons: staleness.reasons,
    };
  }

  return { reviewMapping, updateRequirementLevel, updateQuestion, updateClaim, getCompletion };
}

/** @typedef {ReturnType<typeof createReviewService>} ReviewService */

function readSegments(segments) {
  if (!Array.isArray(segments)) {
    throw new AppError({
      code: 'INVALID_DOCUMENT_SEGMENTS',
      message: 'Stored application segments are invalid.',
      httpStatus: 500,
    });
  }
  return segments;
}

function notFound(code = 'REVIEW_ITEM_NOT_FOUND', message = 'Review item not found.') {
  return new AppError({ code, message, httpStatus: 404 });
}

export const reviewService = createReviewService();
