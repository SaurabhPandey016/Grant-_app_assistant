import { Router } from 'express';
import { createAssessmentController, createDocumentController } from '../controllers/assessment.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { documentUpload } from '../middleware/document-upload.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validatePathParam } from '../middleware/validate-path-param.js';
import { authService } from '../services/auth.service.js';
import { assessmentService } from '../services/assessment.service.js';

export function createAssessmentRouter({
  service = assessmentService,
  authenticationService = authService,
}) {
  const router = Router();
  const controller = createAssessmentController(service);

  router.param('id', validatePathParam());
  router.param('documentId', validatePathParam());
  router.use(requireAuth(authenticationService));
  router.post('/', asyncHandler(controller.create));
  router.get('/', asyncHandler(controller.list));
  router.get('/:id/status', asyncHandler(controller.getStatus));
  router.get('/:id/documents', asyncHandler(controller.listDocuments));
  router.post('/:id/documents', documentUpload, asyncHandler(controller.createDocument));
  router.get('/:id/supporting-documents', asyncHandler(controller.listSupportingDocuments));
  router.post('/:id/supporting-documents', asyncHandler(controller.createSupportingDocument));
  router.patch('/:id/supporting-documents/:documentId', asyncHandler(controller.updateSupportingDocument));
  router.delete('/:id/supporting-documents/:documentId', asyncHandler(controller.deleteSupportingDocument));
  router.get('/:id', asyncHandler(controller.getById));
  router.delete('/:id', asyncHandler(controller.delete));

  return router;
}

export function createDocumentRouter({
  service = assessmentService,
  authenticationService = authService,
} = {}) {
  const router = Router();
  const controller = createDocumentController(service);
  router.param('versionId', validatePathParam());
  router.get('/:versionId', requireAuth(authenticationService), asyncHandler(controller.getById));
  return router;
}
