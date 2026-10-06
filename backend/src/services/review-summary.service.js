import {
  buildReviewSummary,
  renderReviewSummaryMarkdown,
} from '../domain/review-summary.js';
import { isStale } from '../domain/staleness.js';
import {
  createReviewSummaryForUser,
  findLatestReviewSummaryForUser,
  findReviewSummaryForUser,
  findReviewSummarySourceForUser,
} from '../repositories/review-summary.repository.js';
import { AppError } from '../middleware/error-handler.js';

/**
 * @param {{
 *  repository?: {
 *    findReviewSummarySourceForUser: typeof findReviewSummarySourceForUser,
 *    createReviewSummaryForUser: typeof createReviewSummaryForUser,
 *    findLatestReviewSummaryForUser: typeof findLatestReviewSummaryForUser,
 *    findReviewSummaryForUser: typeof findReviewSummaryForUser
 *  },
 *  now?: () => Date
 * }} [dependencies]
 */
export function createReviewSummaryService({
  repository = {
    findReviewSummarySourceForUser,
    createReviewSummaryForUser,
    findLatestReviewSummaryForUser,
    findReviewSummaryForUser,
  },
  now = () => new Date(),
} = {}) {
  async function createSummary(assessmentId, userId) {
    const source = await repository.findReviewSummarySourceForUser(assessmentId, userId);
    if (!source) throw notFound('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    const run = source.analysisRuns[0];
    if (!run) {
      throw new AppError({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Run an analysis before generating a completeness summary.',
        httpStatus: 409,
      });
    }

    const generatedAt = now();
    const content = buildReviewSummary({
      assessment: source,
      run,
      guidelineVersion: run.guidelineVersion,
      applicationVersion: run.applicationVersion,
      requirements: run.requirements,
      supportingDocuments: source.supportingDocuments,
      questions: run.clarificationQuestions,
      claims: run.unsupportedClaims,
      generatedAt,
    });
    const summary = await repository.createReviewSummaryForUser({
      assessmentId,
      runId: run.id,
      guidelineVersionId: run.guidelineVersionId,
      applicationVersionId: run.applicationVersionId,
      generatedById: userId,
      content,
    });
    if (!summary) throw notFound('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    return summary;
  }

  async function getLatestSummary(assessmentId, userId) {
    const summary = await repository.findLatestReviewSummaryForUser(assessmentId, userId);
    if (!summary) throw notFound('REVIEW_SUMMARY_NOT_FOUND', 'Completeness summary not found.');
    return decorateSummary(summary);
  }

  async function exportSummary(summaryId, userId, format) {
    const summary = await repository.findReviewSummaryForUser(summaryId, userId);
    if (!summary) throw notFound('REVIEW_SUMMARY_NOT_FOUND', 'Completeness summary not found.');
    const decorated = decorateSummary(summary);
    const content = {
      ...decorated.content,
      isStale: decorated.isStale,
      currentStaleReasons: decorated.currentStaleReasons,
    };
    return {
      format,
      content,
      markdown: format === 'md' ? renderReviewSummaryMarkdown({
        ...content,
        stale: decorated.isStale,
        staleReasons: decorated.currentStaleReasons,
      }) : null,
    };
  }

  function decorateSummary(summary) {
    const assessment = summary.run.assessment;
    const staleState = isStale(assessment, {
      guidelineVersionId: summary.guidelineVersionId,
      applicationVersionId: summary.applicationVersionId,
    });
    return {
      id: summary.id,
      createdAt: summary.createdAt,
      content: summary.content,
      isStale: staleState.stale,
      currentStaleReasons: staleState.reasons,
    };
  }

  return { createSummary, getLatestSummary, exportSummary };
}

/** @typedef {ReturnType<typeof createReviewSummaryService>} ReviewSummaryService */

function notFound(code, message) {
  return new AppError({ code, message, httpStatus: 404 });
}

export const reviewSummaryService = createReviewSummaryService();
