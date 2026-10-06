import { prisma } from './prisma.js';

/**
 * @typedef {{ id: string, assessmentId: string, kind: string, versionNo: number, title: string, content: string, contentHash: string, segments: unknown, createdAt: Date }} DocumentVersionRecord
 */

/**
 * Creates an immutable version and updates the assessment's current version atomically.
 * @param {{ assessmentId: string, userId: string, kind: 'GUIDELINE' | 'APPLICATION', title: string, content: string, contentHash: string, segments: object[] }} input
 */
export function createDocumentVersionForUser(input) {
  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findFirst({
      where: { id: input.assessmentId, userId: input.userId },
      select: {
        id: true,
        currentGuidelineVersion: {
          select: { id: true, title: true, contentHash: true, versionNo: true, createdAt: true },
        },
        currentApplicationVersion: {
          select: { id: true, title: true, contentHash: true, versionNo: true, createdAt: true },
        },
      },
    });
    if (!assessment) {
      return null;
    }

    const currentVersion = input.kind === 'GUIDELINE'
      ? assessment.currentGuidelineVersion
      : assessment.currentApplicationVersion;

    if (currentVersion?.contentHash === input.contentHash) {
      return { version: currentVersion, unchanged: true };
    }

    const latestVersion = await transaction.documentVersion.findFirst({
      where: { assessmentId: input.assessmentId, kind: input.kind },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });
    const versionNo = (latestVersion?.versionNo ?? 0) + 1;
    const version = await transaction.documentVersion.create({
      data: {
        assessmentId: input.assessmentId,
        kind: input.kind,
        versionNo,
        title: input.title,
        content: input.content,
        contentHash: input.contentHash,
        segments: input.segments,
      },
    });

    await transaction.assessment.update({
      where: { id: assessment.id },
      data: input.kind === 'GUIDELINE'
        ? { currentGuidelineVersionId: version.id }
        : { currentApplicationVersionId: version.id },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: assessment.id,
        actorId: input.userId,
        action: 'document.version.created',
        entityType: 'DocumentVersion',
        entityId: version.id,
        metadata: {
          kind: input.kind,
          versionNo,
          contentHash: input.contentHash,
        },
      },
    });

    return { version, unchanged: false };
  }, { isolationLevel: 'Serializable' });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @param {'GUIDELINE' | 'APPLICATION'} kind
 */
export function listDocumentVersionsForUser(assessmentId, userId, kind) {
  return prisma.documentVersion.findMany({
    where: { assessmentId, ...(kind ? { kind } : {}), assessment: { userId } },
    orderBy: { versionNo: 'desc' },
    select: {
      id: true,
      assessmentId: true,
      kind: true,
      versionNo: true,
      title: true,
      contentHash: true,
      createdAt: true,
    },
  });
}

/**
 * @param {string} versionId
 * @param {string} userId
 * @returns {Promise<DocumentVersionRecord | null>}
 */
export function findDocumentVersionForUser(versionId, userId) {
  return prisma.documentVersion.findFirst({
    where: { id: versionId, assessment: { userId } },
    select: {
      id: true,
      assessmentId: true,
      kind: true,
      versionNo: true,
      title: true,
      content: true,
      contentHash: true,
      segments: true,
      createdAt: true,
    },
  });
}
