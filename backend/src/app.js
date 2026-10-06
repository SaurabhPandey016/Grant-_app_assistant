import express from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.routes.js';
import { createAuthRouter, createCurrentUserRouter } from './routes/auth.routes.js';
import { createAssessmentRouter, createDocumentRouter } from './routes/assessment.routes.js';
import { createAnalysisRouter } from './routes/analysis.routes.js';
import { createReviewRouter } from './routes/review.routes.js';
import { createReviewSummaryRouter } from './routes/review-summary.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './lib/logger.js';
import { authService } from './services/auth.service.js';
import { assessmentService as defaultAssessmentService } from './services/assessment.service.js';
import { analysisService as defaultAnalysisService } from './services/analysis.service.js';
import { reviewService as defaultReviewService } from './services/review.service.js';
import { reviewSummaryService as defaultReviewSummaryService } from './services/review-summary.service.js';

export function createApp({
  authenticationService = authService,
  assessmentService = defaultAssessmentService,
  analysis = defaultAnalysisService,
  review = defaultReviewService,
  reviewSummary = defaultReviewSummaryService,
  assessments = assessmentService,
} = {}) {
  const application = express();

  application.use(pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customProps: (request) => ({ requestId: request.id }),
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          url: new URL(request.url, 'http://localhost').pathname,
          remoteAddress: request.remoteAddress,
        };
      },
    },
  }));
  application.use(express.json({ limit: '1mb' }));
  application.use(cookieParser());
  application.use('/health', healthRouter);
  application.use('/api/v1/auth', createAuthRouter(authenticationService));
  application.use('/auth', createCurrentUserRouter(authenticationService));
  const reviewRouter = createReviewRouter({
    service: review,
    authenticationService,
  });
  application.use('/', reviewRouter);
  application.use('/api/v1', reviewRouter);
  const reviewSummaryRouter = createReviewSummaryRouter({
    service: reviewSummary,
    authenticationService,
  });
  application.use('/', reviewSummaryRouter);
  application.use('/api/v1', reviewSummaryRouter);
  const analysisRouter = createAnalysisRouter({
    service: analysis,
    authenticationService,
  });
  application.use('/assessments', analysisRouter);
  application.use('/api/v1/assessments', analysisRouter);
  const assessmentsRouter = createAssessmentRouter({
    service: assessments,
    authenticationService,
  });
  const documentsRouter = createDocumentRouter({
    service: assessments,
    authenticationService,
  });
  application.use('/assessments', assessmentsRouter);
  application.use('/api/v1/assessments', assessmentsRouter);
  application.use('/documents', documentsRouter);
  application.use('/api/v1/documents', documentsRouter);
  application.use(errorHandler);
  return application;
}

export const app = createApp();
