import { Router } from 'express';
import { createReviewController } from '../controllers/review.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validatePathParam } from '../middleware/validate-path-param.js';
import { authService } from '../services/auth.service.js';
import { reviewService } from '../services/review.service.js';

export function createReviewRouter({
  service = reviewService,
  authenticationService = authService,
} = {}) {
  const router = Router();
  const controller = createReviewController(service);
  const authenticate = requireAuth(authenticationService);
  router.param('id', validatePathParam());
  router.patch('/requirements/:id/mapping/review', authenticate, asyncHandler(controller.reviewMapping));
  router.patch('/requirements/:id/level', authenticate, asyncHandler(controller.updateLevel));
  router.patch('/questions/:id', authenticate, asyncHandler(controller.updateQuestion));
  router.patch('/claims/:id', authenticate, asyncHandler(controller.updateClaim));
  router.get('/assessments/:id/completion', authenticate, asyncHandler(controller.completion));
  return router;
}
