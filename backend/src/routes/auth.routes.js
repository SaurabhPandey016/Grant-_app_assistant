import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AppError } from '../middleware/error-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
import { authService } from '../services/auth.service.js';

export function createCurrentUserRouter(service = authService) {
  const router = Router();
  const controller = createAuthController(service);
  router.get('/me', requireAuth(service), asyncHandler(controller.me));
  return router;
}

export function createAuthRouter(service = authService) {
  const router = Router();
  const controller = createAuthController(service);
  const authenticate = requireAuth(service);

  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler(request, response, next) {
      next(new AppError({
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Try again later.',
        httpStatus: 429,
      }));
    },
  });

  router.post('/register', asyncHandler(controller.register));
  router.post('/login', loginRateLimit, asyncHandler(controller.login));
  router.post('/logout', authenticate, controller.logout);
  router.get('/me', authenticate, controller.me);

  return router;
}
