import { Router } from 'express';
import { createReviewSummaryController } from '../controllers/review-summary.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validatePathParam } from '../middleware/validate-path-param.js';
import { authService } from '../services/auth.service.js';
import { reviewSummaryService } from '../services/review-summary.service.js';

export function createReviewSummaryRouter({
  service = reviewSummaryService,
  authenticationService = authService,
} = {}) {
  const router = Router();
  const controller = createReviewSummaryController(service);
  const authenticate = requireAuth(authenticationService);
  router.param('id', validatePathParam());
  router.post('/assessments/:id/summary', authenticate, asyncHandler(controller.create));
  router.get('/assessments/:id/summary/latest', authenticate, asyncHandler(controller.latest));
  router.get('/summary/:id/export', authenticate, asyncHandler(controller.export));
  return router;
}
