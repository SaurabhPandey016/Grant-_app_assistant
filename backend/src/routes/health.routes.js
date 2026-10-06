import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(healthController));
