import {
  createAssessmentForUser,
  deleteAssessmentForUser,
  findAssessmentForUser,
  listAssessmentsForUser,
} from '../repositories/assessment.repository.js';
import {
  createDocumentVersionForUser,
  findDocumentVersionForUser,
  listDocumentVersionsForUser,
} from '../repositories/document.repository.js';
import {
  createSupportingDocumentForUser,
  deleteSupportingDocumentForUser,
  listSupportingDocumentsForUser,
  updateSupportingDocumentForUser,
} from '../repositories/supporting-document.repository.js';
import { hashDocumentContent } from '../domain/hash.js';
import { splitDocument } from '../domain/segmenter.js';
import { isStale } from '../domain/staleness.js';
import { AppError } from '../middleware/error-handler.js';

/**
 * @typedef {{
 *   createAssessmentForUser: typeof createAssessmentForUser,
 *   deleteAssessmentForUser: typeof deleteAssessmentForUser,
 *   findAssessmentForUser: typeof findAssessmentForUser,
 *   listAssessmentsForUser: typeof listAssessmentsForUser,
 *   createDocumentVersionForUser: typeof createDocumentVersionForUser,
 *   findDocumentVersionForUser: typeof findDocumentVersionForUser,
 *   listDocumentVersionsForUser: typeof listDocumentVersionsForUser,
 *   createSupportingDocumentForUser: typeof createSupportingDocumentForUser,
 *   deleteSupportingDocumentForUser: typeof deleteSupportingDocumentForUser,
 *   listSupportingDocumentsForUser: typeof listSupportingDocumentsForUser,
 *   updateSupportingDocumentForUser: typeof updateSupportingDocumentForUser
 * }} AssessmentRepository
 */

/**
 * @param {{ repository?: AssessmentRepository, segmentDocument?: typeof splitDocument, hashContent?: typeof hashDocumentContent }} [dependencies]
 */
export function createAssessmentService({
  repository = {
    createAssessmentForUser,
    deleteAssessmentForUser,
    findAssessmentForUser,
    listAssessmentsForUser,
    createDocumentVersionForUser,
    findDocumentVersionForUser,
    listDocumentVersionsForUser,
    createSupportingDocumentForUser,
    deleteSupportingDocumentForUser,
    listSupportingDocumentsForUser,
    updateSupportingDocumentForUser,
  },
  segmentDocument = splitDocument,
  hashContent = hashDocumentContent,
} = {}) {
  async function getAssessmentOrThrow(assessmentId, userId) {
    const assessment = await repository.findAssessmentForUser(assessmentId, userId);
    if (!assessment) {
      throw notFoundError('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    }
    return assessment;
  }

  async function createAssessment(userId, name) {
    return repository.createAssessmentForUser(userId, name);
  }

  async function listAssessments(userId) {
    const assessments = await repository.listAssessmentsForUser(userId);
    return assessments.map(withLatestRunStatus);
  }

  async function getAssessment(assessmentId, userId) {
    const assessment = await getAssessmentOrThrow(assessmentId, userId);
    return withLatestRunStatus(assessment);
  }

  async function deleteAssessment(assessmentId, userId) {
    const deleted = await repository.deleteAssessmentForUser(assessmentId, userId);
    if (!deleted) {
      throw notFoundError('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    }
  }

  async function createDocumentVersion(input) {
    const content = input.content;
    if (content.trim().length === 0) {
      throw new AppError({
        code: 'EMPTY_DOCUMENT',
        message: 'Document content must not be empty.',
        httpStatus: 400,
      });
    }

    const segments = segmentDocument(content);
    const result = await repository.createDocumentVersionForUser({
      ...input,
      content,
      contentHash: hashContent(content),
      segments,
    });
    if (!result) {
      throw notFoundError('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    }
    return result;
  }

  async function listDocumentVersions(assessmentId, userId, kind) {
    await getAssessmentOrThrow(assessmentId, userId);
    return repository.listDocumentVersionsForUser(assessmentId, userId, kind);
  }

  async function getDocumentVersion(versionId, userId) {
    const version = await repository.findDocumentVersionForUser(versionId, userId);
    if (!version) {
      throw notFoundError('DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.');
    }
    return version;
  }

  async function createSupportingDocument(input) {
    const document = await repository.createSupportingDocumentForUser(input);
    if (document?.invalidRequirement) {
      throw new AppError({
        code: 'INVALID_REQUIREMENT_LINK',
        message: 'The requirement cannot be linked to this supporting document.',
        httpStatus: 400,
      });
    }
    if (document?.invalidDocType) {
      throw new AppError({
        code: 'SUPPORTING_DOCUMENT_TYPE_MISMATCH',
        message: 'The supporting document type does not match the requirement.',
        httpStatus: 400,
      });
    }
    if (!document) {
      throw notFoundError('ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    }
    return document;
  }

  async function listSupportingDocuments(assessmentId, userId) {
    await getAssessmentOrThrow(assessmentId, userId);
    return repository.listSupportingDocumentsForUser(assessmentId, userId);
  }

  async function updateSupportingDocument(assessmentId, documentId, userId, changes) {
    const document = await repository.updateSupportingDocumentForUser(
      assessmentId,
      documentId,
      userId,
      changes,
    );
    if (document?.invalidRequirement) {
      throw new AppError({
        code: 'INVALID_REQUIREMENT_LINK',
        message: 'The requirement cannot be linked to this supporting document.',
        httpStatus: 400,
      });
    }
    if (document?.invalidDocType) {
      throw new AppError({
        code: 'SUPPORTING_DOCUMENT_TYPE_MISMATCH',
        message: 'The supporting document type does not match the requirement.',
        httpStatus: 400,
      });
    }
    if (!document) {
      throw notFoundError('SUPPORTING_DOCUMENT_NOT_FOUND', 'Supporting document not found.');
    }
    return document;
  }

  async function deleteSupportingDocument(assessmentId, documentId, userId) {
    const deleted = await repository.deleteSupportingDocumentForUser(
      assessmentId,
      documentId,
      userId,
    );
    if (!deleted) {
      throw notFoundError('SUPPORTING_DOCUMENT_NOT_FOUND', 'Supporting document not found.');
    }
  }

  async function getAssessmentStatus(assessmentId, userId) {
    const assessment = await getAssessmentOrThrow(assessmentId, userId);
    const latestRun = assessment.analysisRuns[0] ?? null;
    const staleness = isStale(assessment, latestRun);
    return {
      assessmentId: assessment.id,
      currentGuidelineVersion: assessment.currentGuidelineVersion,
      currentApplicationVersion: assessment.currentApplicationVersion,
      latestRun,
      stale: staleness.stale,
      reasons: staleness.reasons,
    };
  }

  return {
    createAssessment,
    listAssessments,
    getAssessment,
    deleteAssessment,
    createDocumentVersion,
    listDocumentVersions,
    getDocumentVersion,
    createSupportingDocument,
    listSupportingDocuments,
    updateSupportingDocument,
    deleteSupportingDocument,
    getAssessmentStatus,
  };
}

/** @typedef {ReturnType<typeof createAssessmentService>} AssessmentService */

function notFoundError(code, message) {
  return new AppError({ code, message, httpStatus: 404 });
}

export const assessmentService = createAssessmentService();

function withLatestRunStatus(assessment) {
  const { analysisRuns = [], ...assessmentFields } = assessment;
  const latestRun = analysisRuns[0] ?? null;
  return {
    ...assessmentFields,
    latestRun,
    ...isStale(assessment, latestRun),
  };
}
