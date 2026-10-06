import { prisma } from './prisma.js';

/**
 * @typedef {{ id: string, content: string, segments: Array<{ id: string, text: string, start: number, end: number }> }} AnalysisDocument
 * @typedef {{ id: string, assessmentId: string, guidelineVersionId: string, applicationVersionId: string, status: string, provider: string, model: string, promptVersion: string, startedAt: Date, finishedAt: Date | null }} AnalysisRunRecord
 */

/**
 * Acquires an assessment-scoped transaction lock before checking ownership,
 * required versions, and active runs so concurrent requests cannot both start.
 * @param {{ assessmentId: string, userId: string, provider: string, model: string, promptVersion: string }} input
 */
export function startAnalysisRunForUser(input) {
  return prisma.$transaction(async (transaction) => {
    // Read committed gives the post-lock query a fresh snapshot of runs committed while waiting.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(0, hashtext(${input.assessmentId}))`;

    const assessment = await transaction.assessment.findFirst({
      where: { id: input.assessmentId, userId: input.userId },
      select: {
        id: true,
        currentGuidelineVersion: { select: { id: true, content: true, segments: true } },
        currentApplicationVersion: { select: { id: true, content: true, segments: true } },
      },
    });
    if (!assessment) return { notFound: true };
    if (!assessment.currentGuidelineVersion || !assessment.currentApplicationVersion) {
      return { missingDocuments: true };
    }

    const activeRun = await transaction.analysisRun.findFirst({
      where: { assessmentId: assessment.id, status: 'RUNNING' },
      select: { id: true },
    });
    if (activeRun) return { alreadyRunning: true };

    const run = await transaction.analysisRun.create({
      data: {
        assessmentId: assessment.id,
        guidelineVersionId: assessment.currentGuidelineVersion.id,
        applicationVersionId: assessment.currentApplicationVersion.id,
        status: 'RUNNING',
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
      },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: assessment.id,
        actorId: input.userId,
        action: 'analysis.started',
        entityType: 'AnalysisRun',
        entityId: run.id,
        metadata: {
          guidelineVersionId: run.guidelineVersionId,
          applicationVersionId: run.applicationVersionId,
        },
      },
    });

    return {
      run,
      guidelineVersion: assessment.currentGuidelineVersion,
      applicationVersion: assessment.currentApplicationVersion,
    };
  });
}

/**
 * Persists all generated records and marks the run complete atomically.
 * @param {{ runId: string, userId: string, provider: string, model: string, promptVersion: string, requirements: object[], mappings: object[], questions: object[], unsupportedClaims: object[] }} input
 */
export function completeAnalysisRun(input) {
  return prisma.$transaction(async (transaction) => {
    const requirementIds = new Map();
    for (const requirement of input.requirements) {
      const created = await transaction.requirement.create({
        data: {
          runId: input.runId,
          code: requirement.code,
          text: requirement.text,
          category: requirement.category,
          aiLevel: requirement.level,
          levelDisputed: requirement.levelDisputed,
          sourceSegmentId: requirement.sourceSegmentId,
          sourceQuote: requirement.sourceQuote,
          sourceVerified: requirement.sourceVerified,
          needsDocument: requirement.needsDocument,
          documentType: requirement.documentType,
        },
        select: { id: true, code: true },
      });
      requirementIds.set(created.code, created.id);
    }

    for (const mapping of input.mappings) {
      const requirementId = requirementIds.get(mapping.requirementCode);
      if (!requirementId) continue;
      await transaction.mapping.create({
        data: {
          requirementId,
          aiStatus: mapping.status,
          rationale: mapping.rationale,
          evidence: mapping.evidence,
          allVerified: mapping.allVerified,
        },
      });
    }

    for (const question of input.questions) {
      await transaction.clarificationQuestion.create({
        data: {
          runId: input.runId,
          requirementId: question.requirementCode
            ? requirementIds.get(question.requirementCode) ?? null
            : null,
          question: question.question,
          reason: question.reason,
        },
      });
    }

    for (const claim of input.unsupportedClaims) {
      await transaction.unsupportedClaim.create({
        data: {
          runId: input.runId,
          segmentId: claim.segmentId,
          quote: claim.quote,
          quoteVerified: claim.quoteVerified,
          reason: claim.reason,
        },
      });
    }

    const run = await transaction.analysisRun.update({
      where: { id: input.runId },
      data: {
        status: 'COMPLETED',
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        finishedAt: new Date(),
        error: null,
      },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: run.assessmentId,
        actorId: input.userId,
        action: 'analysis.completed',
        entityType: 'AnalysisRun',
        entityId: run.id,
        metadata: {
          requirementCount: input.requirements.length,
          mappingCount: input.mappings.length,
          questionCount: input.questions.length,
          unsupportedClaimCount: input.unsupportedClaims.length,
          provider: input.provider,
          model: input.model,
        },
      },
    });
    return run;
  });
}

/**
 * Marks a failed run and writes its audit event atomically.
 * @param {{ runId: string, userId: string, message: string }} input
 */
export function failAnalysisRun(input) {
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.analysisRun.update({
      where: { id: input.runId },
      data: { status: 'FAILED', error: input.message, finishedAt: new Date() },
      select: { id: true, assessmentId: true },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: run.assessmentId,
        actorId: input.userId,
        action: 'analysis.failed',
        entityType: 'AnalysisRun',
        entityId: run.id,
        metadata: {},
      },
    });
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function findLatestAnalysisForUser(assessmentId, userId) {
  return prisma.analysisRun.findFirst({
    where: { assessmentId, assessment: { userId }, status: 'COMPLETED' },
    orderBy: { startedAt: 'desc' },
    include: {
      requirements: {
        orderBy: { code: 'asc' },
        include: { mapping: true },
      },
      clarificationQuestions: { orderBy: { createdAt: 'asc' } },
      unsupportedClaims: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function listAnalysisRunsForUser(assessmentId, userId) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: { id: true },
  }).then((assessment) => {
    if (!assessment) return null;
    return prisma.analysisRun.findMany({
      where: { assessmentId, assessment: { userId } },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        provider: true,
        model: true,
        promptVersion: true,
        guidelineVersionId: true,
        applicationVersionId: true,
        error: true,
        startedAt: true,
        finishedAt: true,
      },
    });
  });
}

/**
 * @param {string} assessmentId
 * @param {string} runId
 * @param {string} userId
 */
export function findAnalysisRunForUser(assessmentId, runId, userId) {
  return prisma.analysisRun.findFirst({
    where: { id: runId, assessmentId, assessment: { userId } },
    include: {
      requirements: {
        orderBy: { code: 'asc' },
        include: { mapping: true },
      },
      clarificationQuestions: { orderBy: { createdAt: 'asc' } },
      unsupportedClaims: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/**
 * Mark runs left RUNNING by a stopped web process as failed before accepting traffic.
 * @param {{ message: string }} input
 */
export function failInterruptedAnalysisRuns(input) {
  return prisma.$transaction(async (transaction) => {
    const runs = await transaction.analysisRun.findMany({
      where: { status: 'RUNNING' },
      select: { id: true, assessmentId: true },
    });
    if (runs.length === 0) return 0;

    const finishedAt = new Date();
    await transaction.analysisRun.updateMany({
      where: { id: { in: runs.map((run) => run.id) }, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        error: input.message,
        finishedAt,
      },
    });
    await transaction.auditEvent.createMany({
      data: runs.map((run) => ({
        assessmentId: run.assessmentId,
        action: 'analysis.failed',
        entityType: 'AnalysisRun',
        entityId: run.id,
        metadata: { reason: 'WORKER_RESTART' },
      })),
    });
    return runs.length;
  });
}

/**
 * @param {string} requirementId
 * @param {string} userId
 * @param {{ decision: string, reviewerStatus?: string, evidence?: object[], note?: string | null }} input
 */
export function reviewMappingForUser(requirementId, userId, input) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.mapping.findFirst({
      where: { requirementId, requirement: { run: { assessment: { userId } } } },
      include: {
        requirement: {
          include: {
            run: {
              include: {
                assessment: {
                  select: {
                    id: true,
                    currentGuidelineVersionId: true,
                    currentApplicationVersionId: true,
                  },
                },
                applicationVersion: { select: { segments: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) return null;

    const before = auditMappingState(existing);
    const updated = await transaction.mapping.update({
      where: { id: existing.id },
      data: {
        reviewDecision: input.decision,
        reviewerStatus: input.decision === 'CORRECTED' ? input.reviewerStatus : null,
        ...(input.evidence === undefined
          ? {}
          : { reviewerEvidence: input.evidence }),
        reviewerNote: input.note ?? null,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: existing.requirement.run.assessment.id,
        actorId: userId,
        action: 'mapping.reviewed',
        entityType: 'Mapping',
        entityId: existing.id,
        metadata: {
          before,
          after: auditMappingState(updated),
        },
      },
    });
    return {
      mapping: updated,
      requirement: existing.requirement,
      applicationSegments: existing.requirement.run.applicationVersion.segments,
      assessment: existing.requirement.run.assessment,
    };
  });
}

/**
 * @param {string} requirementId
 * @param {string} userId
 */
export function findMappingReviewContextForUser(requirementId, userId) {
  return prisma.mapping.findFirst({
    where: { requirementId, requirement: { run: { assessment: { userId } } } },
    select: {
      requirement: {
        select: {
          run: {
            select: {
              guidelineVersionId: true,
              applicationVersionId: true,
              applicationVersion: { select: { segments: true } },
              assessment: {
                select: {
                  currentGuidelineVersionId: true,
                  currentApplicationVersionId: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * @param {string} requirementId
 * @param {string} userId
 * @param {'MANDATORY' | 'RECOMMENDED' | null} levelOverride
 */
export function updateRequirementLevelForUser(requirementId, userId, levelOverride) {
  return prisma.$transaction(async (transaction) => {
    const requirement = await transaction.requirement.findFirst({
      where: { id: requirementId, run: { assessment: { userId } } },
      include: { run: { include: { assessment: { select: { id: true } } } } },
    });
    if (!requirement) return null;
    const updated = await transaction.requirement.update({
      where: { id: requirementId },
      data: { levelOverride },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: requirement.run.assessment.id,
        actorId: userId,
        action: 'requirement.level.updated',
        entityType: 'Requirement',
        entityId: requirementId,
        metadata: {
          before: { levelOverride: requirement.levelOverride },
          after: { levelOverride: updated.levelOverride },
        },
      },
    });
    return updated;
  });
}

/**
 * @param {string} questionId
 * @param {string} userId
 * @param {{ status: string, answer?: string | null }} changes
 */
export function updateQuestionForUser(questionId, userId, changes) {
  return prisma.$transaction(async (transaction) => {
    const question = await transaction.clarificationQuestion.findFirst({
      where: { id: questionId, run: { assessment: { userId } } },
      include: { run: { select: { assessmentId: true } } },
    });
    if (!question) return null;
    const updated = await transaction.clarificationQuestion.update({
      where: { id: questionId },
      data: changes,
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: question.run.assessmentId,
        actorId: userId,
        action: 'clarification_question.updated',
        entityType: 'ClarificationQuestion',
        entityId: questionId,
        metadata: {
          before: { status: question.status, answer: question.answer },
          after: { status: updated.status, answer: updated.answer },
        },
      },
    });
    return updated;
  });
}

/**
 * @param {string} claimId
 * @param {string} userId
 * @param {string} reviewDecision
 */
export function updateClaimForUser(claimId, userId, reviewDecision) {
  return prisma.$transaction(async (transaction) => {
    const claim = await transaction.unsupportedClaim.findFirst({
      where: { id: claimId, run: { assessment: { userId } } },
      include: { run: { select: { assessmentId: true } } },
    });
    if (!claim) return null;
    const updated = await transaction.unsupportedClaim.update({
      where: { id: claimId },
      data: { reviewDecision },
    });
    await transaction.auditEvent.create({
      data: {
        assessmentId: claim.run.assessmentId,
        actorId: userId,
        action: 'unsupported_claim.reviewed',
        entityType: 'UnsupportedClaim',
        entityId: claimId,
        metadata: {
          before: { reviewDecision: claim.reviewDecision },
          after: { reviewDecision: updated.reviewDecision },
        },
      },
    });
    return updated;
  });
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 */
export function findCompletionDataForUser(assessmentId, userId) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: {
      id: true,
      currentGuidelineVersionId: true,
      currentApplicationVersionId: true,
      analysisRuns: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: {
          requirements: { include: { mapping: true } },
        },
      },
      supportingDocuments: {
        select: { id: true, name: true, docType: true, status: true, requirementId: true },
      },
    },
  });
}

function auditMappingState(mapping) {
  return {
    reviewDecision: mapping.reviewDecision,
    reviewerStatus: mapping.reviewerStatus,
    reviewerNote: mapping.reviewerNote,
    reviewerEvidenceCount: Array.isArray(mapping.reviewerEvidence)
      ? mapping.reviewerEvidence.length
      : 0,
  };
}
