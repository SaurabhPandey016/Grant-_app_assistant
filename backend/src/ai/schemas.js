import { z } from 'zod';

export const RequirementCategory = z.enum([
  'ELIGIBILITY',
  'SUBMISSION',
  'DOCUMENT',
  'CONTENT',
  'OTHER',
]);
export const RequirementLevel = z.enum(['MANDATORY', 'RECOMMENDED']);
export const EvidenceStatus = z.enum(['SUPPORTED', 'PARTIAL', 'AMBIGUOUS', 'MISSING']);

export const RequirementsOutput = z.object({
  requirements: z.array(z.object({
    text: z.string().trim().min(1).max(4000),
    category: RequirementCategory,
    level: RequirementLevel,
    sourceSegmentId: z.string().regex(/^S\d+$/),
    sourceQuote: z.string().trim().min(1).max(4000),
    needsDocument: z.boolean(),
    documentType: z.string().trim().min(1).max(160).nullable(),
  }).strict()).max(200),
}).strict();

export const MappingOutput = z.object({
  mappings: z.array(z.object({
    requirementCode: z.string().trim().min(1).max(32),
    status: EvidenceStatus,
    rationale: z.string().trim().min(1).max(4000),
    evidence: z.array(z.object({
      segmentId: z.string().regex(/^S\d+$/),
      quote: z.string().trim().min(1).max(4000),
    }).strict()).max(3),
  }).strict()).max(200),
}).strict();

export const ClaimsAndQuestionsOutput = z.object({
  unsupportedClaims: z.array(z.object({
    segmentId: z.string().regex(/^S\d+$/),
    quote: z.string().trim().min(1).max(4000),
    reason: z.string().trim().min(1).max(4000),
  }).strict()).max(200),
  questions: z.array(z.object({
    requirementCode: z.string().trim().min(1).max(32).nullable(),
    question: z.string().trim().min(1).max(2000),
    reason: z.string().trim().min(1).max(2000),
  }).strict()).max(200),
}).strict();
