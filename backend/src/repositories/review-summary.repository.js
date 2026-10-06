import { prisma } from './prisma.js';

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function findReviewSummarySourceForUser(assessmentId, userId) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: {
      id: true,
      name: true,
      currentGuidelineVersionId: true,
      currentApplicationVersionId: true,
      supportingDocuments: {
        select: {
          id: true,
          name: true,
          docType: true,
          status: true,
          requirementId: true,
        },
      },
      analysisRuns: {
        where: { status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: {
          guidelineVersion: { select: { id: true, title: true, versionNo: true } },
          applicationVersion: { select: { id: true, title: true, versionNo: true } },
          requirements: {
            orderBy: { code: 'asc' },
            include: { mapping: true },
          },
          clarificationQuestions: {
            orderBy: { createdAt: 'asc' },
            include: { requirement: { select: { code: true } } },
          },
          unsupportedClaims: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
}

/**
 * @param {{ assessmentId: string, runId: string, guidelineVersionId: string, applicationVersionId: string, generatedById: string, content: object }} input
 */
export function createReviewSummaryForUser(input) {
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.analysisRun.findFirst({
      where: {
        id: input.runId,
        assessmentId: input.assessmentId,
        status: 'COMPLETED',
        assessment: { userId: input.generatedById },
      },
      select: { id: true },
    });
    if (!run) return null;

    const summary = await transaction.reviewSummary.create({
      data: {
        runId: input.runId,
        guidelineVersionId: input.guidelineVersionId,
        applicationVersionId: input.applicationVersionId,
        generatedById: input.generatedById,
        content: input.content,
      },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: input.assessmentId,
        actorId: input.generatedById,
        action: 'review_summary.created',
        entityType: 'ReviewSummary',
        entityId: summary.id,
        metadata: {
          runId: input.runId,
          guidelineVersionId: input.guidelineVersionId,
          applicationVersionId: input.applicationVersionId,
          pendingItemCount: input.content.unreviewed.total,
        },
      },
    });
    return summary;
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function findLatestReviewSummaryForUser(assessmentId, userId) {
  return prisma.reviewSummary.findFirst({
    where: { run: { assessmentId, assessment: { userId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      run: {
        select: {
          id: true,
          assessment: {
            select: {
              currentGuidelineVersionId: true,
              currentApplicationVersionId: true,
            },
          },
        },
      },
    },
  });
}

/**
 * @param {string} summaryId
 * @param {string} userId
 */
export function findReviewSummaryForUser(summaryId, userId) {
  return prisma.reviewSummary.findFirst({
    where: { id: summaryId, run: { assessment: { userId } } },
    include: {
      run: {
        select: {
          id: true,
          assessment: {
            select: {
              currentGuidelineVersionId: true,
              currentApplicationVersionId: true,
            },
          },
        },
      },
    },
  });
}
