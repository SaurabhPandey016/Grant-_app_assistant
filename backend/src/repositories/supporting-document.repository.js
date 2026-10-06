import { prisma } from './prisma.js';

const supportingDocumentSelect = {
  id: true,
  assessmentId: true,
  name: true,
  docType: true,
  status: true,
  notes: true,
  requirementId: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * @param {{ assessmentId: string, userId: string, name: string, docType: string, status: string, notes?: string | null, requirementId?: string | null }} input
 */
export async function createSupportingDocumentForUser(input) {
  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findFirst({
      where: { id: input.assessmentId, userId: input.userId },
      select: { id: true },
    });
    if (!assessment) {
      return null;
    }
    const invalidLink = await validateRequirementLink(
      transaction,
      input.assessmentId,
      input.requirementId,
      input.docType,
    );
    if (invalidLink) return invalidLink;

    const document = await transaction.supportingDocument.create({
      data: {
        assessmentId: input.assessmentId,
        name: input.name,
        docType: input.docType,
        status: input.status,
        notes: input.notes ?? null,
        requirementId: input.requirementId ?? null,
      },
      select: supportingDocumentSelect,
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: assessment.id,
        actorId: input.userId,
        action: 'supporting_document.created',
        entityType: 'SupportingDocument',
        entityId: document.id,
        metadata: {
          docType: document.docType,
          status: document.status,
          requirementId: document.requirementId,
        },
      },
    });
    return document;
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function listSupportingDocumentsForUser(assessmentId, userId) {
  return prisma.supportingDocument.findMany({
    where: { assessmentId, assessment: { userId } },
    orderBy: { createdAt: 'asc' },
    select: supportingDocumentSelect,
  });
}

/**
 * @param {string} assessmentId
 * @param {string} documentId
 * @param {string} userId
 * @param {{ name?: string, docType?: string, status?: string, notes?: string | null, requirementId?: string | null }} changes
 */
export async function updateSupportingDocumentForUser(assessmentId, documentId, userId, changes) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.supportingDocument.findFirst({
      where: { id: documentId, assessmentId, assessment: { userId } },
      select: { id: true, docType: true, requirementId: true, status: true },
    });
    if (!existing) {
      return null;
    }

    const requirementId = changes.requirementId === undefined
      ? existing.requirementId
      : changes.requirementId;
    const invalidLink = await validateRequirementLink(
      transaction,
      assessmentId,
      requirementId,
      changes.docType ?? existing.docType,
    );
    if (invalidLink) return invalidLink;

    const document = await transaction.supportingDocument.update({
      where: { id: documentId },
      data: changes,
      select: supportingDocumentSelect,
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId,
        actorId: userId,
        action: 'supporting_document.updated',
        entityType: 'SupportingDocument',
        entityId: document.id,
        metadata: {
          before: {
            docType: existing.docType,
            requirementId: existing.requirementId,
            status: existing.status,
          },
          after: {
            docType: document.docType,
            requirementId: document.requirementId,
            status: document.status,
          },
          updatedFields: Object.keys(changes),
        },
      },
    });
    return document;
  });
}

function normalizeDocumentType(value) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

async function validateRequirementLink(transaction, assessmentId, requirementId, docType) {
  if (!requirementId) return null;
  const requirement = await transaction.requirement.findFirst({
    where: { id: requirementId, run: { assessmentId } },
    select: { id: true, documentType: true },
  });
  if (!requirement) return { invalidRequirement: true };
  if (
    requirement.documentType
    && normalizeDocumentType(docType) !== normalizeDocumentType(requirement.documentType)
  ) {
    return { invalidDocType: true };
  }
  return null;
}

/**
 * @param {string} assessmentId
 * @param {string} documentId
 * @param {string} userId
 */
export async function deleteSupportingDocumentForUser(assessmentId, documentId, userId) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.supportingDocument.findFirst({
      where: { id: documentId, assessmentId, assessment: { userId } },
      select: { id: true },
    });
    if (!existing) {
      return false;
    }

    await transaction.supportingDocument.delete({ where: { id: documentId } });
    await transaction.auditEvent.create({
      data: {
        assessmentId,
        actorId: userId,
        action: 'supporting_document.deleted',
        entityType: 'SupportingDocument',
        entityId: documentId,
        metadata: {},
      },
    });
    return true;
  });
}
