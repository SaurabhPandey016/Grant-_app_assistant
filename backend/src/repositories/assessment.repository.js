import { prisma } from './prisma.js';

/**
 * @typedef {{
 *   id: string,
 *   userId: string,
 *   name: string,
 *   currentGuidelineVersionId: string | null,
 *   currentApplicationVersionId: string | null,
 *   currentGuidelineVersion: object | null,
 *   currentApplicationVersion: object | null,
 *   analysisRuns: object[],
 *   createdAt: Date,
 *   updatedAt: Date
 * }} OwnedAssessment
 */

/**
 * Fetches an assessment only when it belongs to the requesting user.
 * @param {string} assessmentId
 * @param {string} userId
 * @returns {Promise<OwnedAssessment | null>}
 */
export function findAssessmentForUser(assessmentId, userId) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      currentGuidelineVersionId: true,
      currentApplicationVersionId: true,
      createdAt: true,
      updatedAt: true,
      currentGuidelineVersion: {
        select: { id: true, kind: true, versionNo: true, title: true, contentHash: true, createdAt: true },
      },
      currentApplicationVersion: {
        select: { id: true, kind: true, versionNo: true, title: true, contentHash: true, createdAt: true },
      },
      analysisRuns: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          guidelineVersionId: true,
          applicationVersionId: true,
          provider: true,
          model: true,
          promptVersion: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
}

/**
 * @param {string} userId
 * @param {string} name
 */
export async function createAssessmentForUser(userId, name) {
  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.create({
      data: { userId, name },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: assessment.id,
        actorId: userId,
        action: 'assessment.created',
        entityType: 'Assessment',
        entityId: assessment.id,
        metadata: {},
      },
    });
    return assessment;
  });
}

/**
 * @param {string} userId
 */
export function listAssessmentsForUser(userId) {
  return prisma.assessment.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      currentGuidelineVersionId: true,
      currentApplicationVersionId: true,
      createdAt: true,
      updatedAt: true,
      analysisRuns: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { status: true, guidelineVersionId: true, applicationVersionId: true },
      },
    },
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export async function deleteAssessmentForUser(assessmentId, userId) {
  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findFirst({
      where: { id: assessmentId, userId },
      select: { id: true },
    });
    if (!assessment) {
      return false;
    }

    await transaction.assessment.delete({ where: { id: assessmentId } });
    await transaction.auditEvent.create({
      data: {
        actorId: userId,
        action: 'assessment.deleted',
        entityType: 'Assessment',
        entityId: assessmentId,
        metadata: {},
      },
    });
    return true;
  });
}
