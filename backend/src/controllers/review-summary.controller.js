import { AppError } from '../middleware/error-handler.js';
import { z } from 'zod';

const exportFormatSchema = z.enum(['md', 'json']);

/**
 * @param {import('../services/review-summary.service.js').ReviewSummaryService} service
 */
export function createReviewSummaryController(service) {
  return {
    async create(request, response) {
      const summary = await service.createSummary(request.params.id, request.user.id);
      response.status(201).json({ summary });
    },

    async latest(request, response) {
      const summary = await service.getLatestSummary(request.params.id, request.user.id);
      response.status(200).json({ summary });
    },

    async export(request, response) {
      const parsedFormat = exportFormatSchema.safeParse(request.query.format ?? 'md');
      if (!parsedFormat.success) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'format must be md or json.',
          httpStatus: 400,
        });
      }
      const format = parsedFormat.data;
      const result = await service.exportSummary(request.params.id, request.user.id, format);
      if (format === 'md') {
        response
          .status(200)
          .type('text/markdown')
          .attachment(`completeness-summary-${request.params.id}.md`)
          .send(result.markdown);
        return;
      }
      response
        .status(200)
        .type('application/json')
        .attachment(`completeness-summary-${request.params.id}.json`)
        .send(JSON.stringify(result.content, null, 2));
    },
  };
}
