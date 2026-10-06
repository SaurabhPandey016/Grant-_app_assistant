import { Router } from 'express';
import { createAnalysisController } from '../controllers/analysis.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validatePathParam } from '../middleware/validate-path-param.js';
import { authService } from '../services/auth.service.js';
import { analysisService } from '../services/analysis.service.js';

export function createAnalysisRouter({
  service = analysisService,
  authenticationService = authService,
} = {}) {
  const router = Router();
  const controller = createAnalysisController(service);
  router.param('id', validatePathParam());
  router.use(requireAuth(authenticationService));
  router.post('/:id/analysis', asyncHandler(controller.run));
  router.get('/:id/analysis/latest', asyncHandler(controller.latest));
  router.get('/:id/analysis/runs', asyncHandler(controller.listRuns));
  return router;
}
