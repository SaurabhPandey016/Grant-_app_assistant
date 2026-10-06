import path from 'node:path';
import { TextDecoder } from 'node:util';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { serializeAssessment, serializeDocumentVersion, serializeSupportingDocument } from '../serializers/assessment.serializer.js';

const assessmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
}).strict();

const documentKindSchema = z.enum(['GUIDELINE', 'APPLICATION']);
const documentBodySchema = z.object({
  kind: documentKindSchema,
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
}).strict();

const supportingDocumentCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  docType: z.string().trim().min(1).max(120),
  status: z.enum(['PROVIDED', 'MISSING', 'NOT_APPLICABLE']),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const supportingDocumentUpdateSchema = supportingDocumentCreateSchema.partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'At least one field must be provided.');

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body.',
      httpStatus: 400,
      details: result.error.issues.map(({ path: issuePath, message }) => ({
        path: issuePath,
        message,
      })),
    });
  }
  return result.data;
}

function readDocumentInput(request) {
  const body = parseBody(documentBodySchema, request.body);
  let content = body.content;
  let title = body.title;

  if (request.file) {
    const extension = path.extname(request.file.originalname).toLowerCase();
    if (!['.txt', '.md'].includes(extension)) {
      throw new AppError({
        code: 'UNSUPPORTED_DOCUMENT_TYPE',
        message: 'Only .txt and .md documents are supported.',
        httpStatus: 415,
      });
    }

    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(request.file.buffer);
    } catch {
      throw new AppError({
        code: 'INVALID_DOCUMENT_ENCODING',
        message: 'Document files must use UTF-8 encoding.',
        httpStatus: 400,
      });
    }
    title ??= path.basename(request.file.originalname.replaceAll('\\', '/'), extension);
  }

  if (typeof content !== 'string') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Provide document content or upload a .txt or .md file.',
      httpStatus: 400,
    });
  }
  if (content.trim().length === 0) {
    throw new AppError({
      code: 'EMPTY_DOCUMENT',
      message: 'Document content must not be empty.',
      httpStatus: 400,
    });
  }
  if (!title) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'A document title is required.',
      httpStatus: 400,
    });
  }

  return { ...body, title, content };
}

function parseDocumentKind(value) {
  const result = documentKindSchema.safeParse(value);
  if (!result.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Query parameter kind must be GUIDELINE or APPLICATION.',
      httpStatus: 400,
    });
  }
  return result.data;
}

/** @param {import('../services/assessment.service.js').AssessmentService} service */
export function createAssessmentController(service) {
  return {
    async create(request, response) {
      const { name } = parseBody(assessmentSchema, request.body);
      const assessment = await service.createAssessment(request.user.id, name);
      response.status(201).json({ assessment: serializeAssessment(assessment) });
    },

    async list(request, response) {
      const assessments = await service.listAssessments(request.user.id);
      response.status(200).json({ assessments: assessments.map(serializeAssessment) });
    },

    async getById(request, response) {
      const assessment = await service.getAssessment(request.params.id, request.user.id);
      response.status(200).json({ assessment: serializeAssessment(assessment) });
    },

    async delete(request, response) {
      await service.deleteAssessment(request.params.id, request.user.id);
      response.status(204).end();
    },

    async createDocument(request, response) {
      const input = readDocumentInput(request);
      const result = await service.createDocumentVersion({
        ...input,
        assessmentId: request.params.id,
        userId: request.user.id,
      });
      response.status(result.unchanged ? 200 : 201).json({
        version: serializeDocumentVersion(result.version),
        unchanged: result.unchanged,
      });
    },

    async listDocuments(request, response) {
      const kind = request.query.kind === undefined ? undefined : parseDocumentKind(request.query.kind);
      const versions = await service.listDocumentVersions(
        request.params.id,
        request.user.id,
        kind,
      );
      response.status(200).json({ versions: versions.map(serializeDocumentVersion) });
    },

    async createSupportingDocument(request, response) {
      const input = parseBody(supportingDocumentCreateSchema, request.body);
      const document = await service.createSupportingDocument({
        ...input,
        assessmentId: request.params.id,
        userId: request.user.id,
      });
      response.status(201).json({ supportingDocument: serializeSupportingDocument(document) });
    },

    async listSupportingDocuments(request, response) {
      const documents = await service.listSupportingDocuments(request.params.id, request.user.id);
      response.status(200).json({
        supportingDocuments: documents.map(serializeSupportingDocument),
      });
    },

    async updateSupportingDocument(request, response) {
      const changes = parseBody(supportingDocumentUpdateSchema, request.body);
      const document = await service.updateSupportingDocument(
        request.params.id,
        request.params.documentId,
        request.user.id,
        changes,
      );
      response.status(200).json({ supportingDocument: serializeSupportingDocument(document) });
    },

    async deleteSupportingDocument(request, response) {
      await service.deleteSupportingDocument(
        request.params.id,
        request.params.documentId,
        request.user.id,
      );
      response.status(204).end();
    },

    async getStatus(request, response) {
      const status = await service.getAssessmentStatus(request.params.id, request.user.id);
      response.status(200).json(status);
    },
  };
}

export function createDocumentController(service) {
  return {
    async getById(request, response) {
      const version = await service.getDocumentVersion(request.params.versionId, request.user.id);
      response.status(200).json({ version: serializeDocumentVersion(version, true) });
    },
  };
}
