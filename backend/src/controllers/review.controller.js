import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const evidenceSchema = z.array(z.object({
  segmentId: z.string().regex(/^S\d+$/),
  quote: z.string().trim().min(1).max(4000),
}).strict()).max(20);

const mappingReviewSchema = z.object({
  decision: z.enum(['CONFIRMED', 'CORRECTED', 'REJECTED']),
  reviewerStatus: z.enum(['SUPPORTED', 'PARTIAL', 'AMBIGUOUS', 'MISSING']).optional(),
  evidence: evidenceSchema.optional(),
  note: z.string().trim().max(5000).nullable().optional(),
}).strict().superRefine((input, context) => {
  if (input.decision === 'CORRECTED' && !input.reviewerStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reviewerStatus'],
      message: 'reviewerStatus is required when correcting a mapping.',
    });
  }
});

const levelSchema = z.object({
  levelOverride: z.enum(['MANDATORY', 'RECOMMENDED']).nullable(),
}).strict();

const questionSchema = z.object({
  status: z.enum(['OPEN', 'ANSWERED', 'DISMISSED']),
  answer: z.string().trim().max(5000).nullable().optional(),
}).strict();

const claimSchema = z.object({
  reviewDecision: z.enum(['PENDING', 'CONFIRMED_ISSUE', 'DISMISSED']),
}).strict();

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body.',
      httpStatus: 400,
      details: result.error.issues.map(({ path, message }) => ({ path, message })),
    });
  }
  return result.data;
}

/**
 * @param {import('../services/review.service.js').ReviewService} service
 */
export function createReviewController(service) {
  return {
    async reviewMapping(request, response) {
      const result = await service.reviewMapping(
        request.params.id,
        request.user.id,
        parse(mappingReviewSchema, request.body),
      );
      response.status(200).json({
        mapping: result.mapping,
        stale: result.stale,
        reasons: result.reasons,
      });
    },

    async updateLevel(request, response) {
      const requirement = await service.updateRequirementLevel(
        request.params.id,
        request.user.id,
        parse(levelSchema, request.body).levelOverride,
      );
      response.status(200).json({ requirement });
    },

    async updateQuestion(request, response) {
      const question = await service.updateQuestion(
        request.params.id,
        request.user.id,
        parse(questionSchema, request.body),
      );
      response.status(200).json({ question });
    },

    async updateClaim(request, response) {
      const claim = await service.updateClaim(
        request.params.id,
        request.user.id,
        parse(claimSchema, request.body).reviewDecision,
      );
      response.status(200).json({ claim });
    },

    async completion(request, response) {
      const completion = await service.getCompletion(request.params.id, request.user.id);
      response.status(200).json({ completion });
    },
  };
}
