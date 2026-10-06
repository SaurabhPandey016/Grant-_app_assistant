import { env } from '../config/env.js';
import { levelSignal, verifyEvidence, verifyQuote } from '../domain/citations.js';
import {
  completeAnalysisRun,
  failAnalysisRun,
  findLatestAnalysisForUser,
  listAnalysisRunsForUser,
  findAnalysisRunForUser,
  failInterruptedAnalysisRuns,
  startAnalysisRunForUser,
} from '../repositories/analysis.repository.js';
import { aiService } from '../ai/index.js';
import { PROMPT_VERSION } from '../ai/prompts/index.js';
import { logger as defaultLogger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';

const MAX_SAVED_QUESTIONS = 100;
const MAX_SAVED_CLAIMS = 100;
const SAFE_FAILURE_MESSAGE = 'Analysis failed. Please try again.';

/**
 * @param {{
 *  repository?: {
 *    startAnalysisRunForUser: typeof startAnalysisRunForUser,
 *    completeAnalysisRun: typeof completeAnalysisRun,
 *    failAnalysisRun: typeof failAnalysisRun,
 *    findLatestAnalysisForUser: typeof findLatestAnalysisForUser,
 *    listAnalysisRunsForUser: typeof listAnalysisRunsForUser,
 *    findAnalysisRunForUser: typeof findAnalysisRunForUser,
 *    failInterruptedAnalysisRuns: typeof failInterruptedAnalysisRuns
 *  },
 *  ai?: typeof aiService,
 *  logger?: import('pino').Logger,
 *  schedule?: (task: () => Promise<void>) => void,
 *  provider?: string,
 *  model?: string,
 *  promptVersion?: string
 * }} [dependencies]
 */
export function createAnalysisService({
  repository = {
    startAnalysisRunForUser,
    completeAnalysisRun,
    failAnalysisRun,
    findLatestAnalysisForUser,
    listAnalysisRunsForUser,
    findAnalysisRunForUser,
    failInterruptedAnalysisRuns,
  },
  ai = aiService,
  logger = defaultLogger,
  schedule = (task) => { setImmediate(() => { void task(); }); },
  provider = env.LLM_PROVIDER === 'heuristic' ? 'heuristic' : 'openai-compatible',
  model = env.LLM_PROVIDER === 'heuristic' ? 'deterministic-rules-v1' : env.LLM_MODEL,
  promptVersion = PROMPT_VERSION,
} = {}) {
  async function startAnalysis(assessmentId, userId) {
    const started = await repository.startAnalysisRunForUser({
      assessmentId,
      userId,
      provider,
      model,
      promptVersion,
    });
    if (started.notFound) {
      throw new AppError({ code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment not found.', httpStatus: 404 });
    }
    if (started.missingDocuments) {
      throw new AppError({
        code: 'MISSING_DOCUMENTS',
        message: 'Add both a guideline and an application before running analysis.',
        httpStatus: 409,
      });
    }
    if (started.alreadyRunning) {
      throw new AppError({
        code: 'ANALYSIS_ALREADY_RUNNING',
        message: 'An analysis is already running for this assessment.',
        httpStatus: 409,
      });
    }

    schedule(() => processStartedRun(started, userId));
    return started.run;
  }

  async function processStartedRun(started, userId) {
    const { run } = started;
    try {
      const guidelineSegments = readSegments(started.guidelineVersion.segments);
      const applicationSegments = readSegments(started.applicationVersion.segments);
      const output = await ai.runAnalysis({ guidelineSegments, applicationSegments });
      const prepared = prepareOutput(output, guidelineSegments, applicationSegments, logger);
      const completedRun = await repository.completeAnalysisRun({
        runId: run.id,
        userId,
        provider: output.provider,
        model: output.model,
        promptVersion: output.promptVersion,
        ...prepared,
      });
      return completedRun;
    } catch (error) {
      try {
        await repository.failAnalysisRun({
          runId: run.id,
          userId,
          message: SAFE_FAILURE_MESSAGE,
        });
      } catch (persistenceError) {
        logger.error({
          runId: run.id,
          errorName: persistenceError?.name ?? 'Error',
          errorCode: persistenceError?.code,
        }, 'Could not mark analysis run as failed');
      }
      logger.error({
        runId: run.id,
        errorName: error?.name ?? 'Error',
        errorCode: error?.code,
      }, 'Analysis run failed');
      return null;
    }
  }

  async function getAnalysisRun(assessmentId, runId, userId) {
    const run = await repository.findAnalysisRunForUser(assessmentId, runId, userId);
    if (!run) {
      throw new AppError({
        code: 'ANALYSIS_RUN_NOT_FOUND',
        message: 'Analysis run not found.',
        httpStatus: 404,
      });
    }
    return run;
  }

  async function failInterruptedRunsOnStartup() {
    return repository.failInterruptedAnalysisRuns({
      message: 'Analysis was interrupted by a service restart. Please run it again.',
    });
  }

  async function getLatestAnalysis(assessmentId, userId) {
    const result = await repository.findLatestAnalysisForUser(assessmentId, userId);
    if (!result) {
      throw new AppError({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Completed analysis not found.',
        httpStatus: 404,
      });
    }
    return result;
  }

  async function listAnalysisRuns(assessmentId, userId) {
    const runs = await repository.listAnalysisRunsForUser(assessmentId, userId);
    if (runs === null) {
      throw new AppError({ code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment not found.', httpStatus: 404 });
    }
    return runs;
  }

  return {
    startAnalysis,
    getAnalysisRun,
    getLatestAnalysis,
    listAnalysisRuns,
    failInterruptedRunsOnStartup,
  };
}

/** @typedef {ReturnType<typeof createAnalysisService>} AnalysisService */

function readSegments(segments) {
  if (!Array.isArray(segments)) {
    throw new AppError({
      code: 'INVALID_DOCUMENT_SEGMENTS',
      message: 'Stored document segments are invalid.',
      httpStatus: 500,
    });
  }
  return segments;
}

function prepareOutput(output, guidelineSegments, applicationSegments, logger) {
  const requirements = [];
  const requirementCodes = new Set();
  const codeRemap = new Map();

  output.requirements.forEach((requirement, index) => {
    if (
      !requirement.sourceSegmentId
      || !requirement.sourceQuote?.trim()
      || !guidelineSegments.some((segment) => segment.id === requirement.sourceSegmentId)
    ) {
      logger.warn({ requirementIndex: index }, 'Dropped AI requirement without a source citation');
      return;
    }
    const code = `R${requirements.length + 1}`;
    codeRemap.set(requirement.code ?? `R${index + 1}`, code);
    const signal = levelSignal(requirement.sourceQuote);
    requirements.push({
      ...requirement,
      code,
      sourceVerified: verifyQuote(
        guidelineSegments,
        requirement.sourceSegmentId,
        requirement.sourceQuote,
      ),
      levelDisputed: signal !== 'NEUTRAL' && signal !== requirement.level,
    });
    requirementCodes.add(code);
  });

  const aiMappings = new Map();
  for (const mapping of output.mappings) {
    const requirementCode = codeRemap.get(mapping.requirementCode);
    if (!requirementCode || !requirementCodes.has(requirementCode)) {
      logger.warn({ requirementCode: mapping.requirementCode }, 'Ignored mapping for unknown requirement');
      continue;
    }
    if (aiMappings.has(requirementCode)) {
      logger.warn({ requirementCode: mapping.requirementCode }, 'Ignored duplicate mapping');
      continue;
    }
    const { evidence, allVerified } = verifyEvidence(applicationSegments, mapping.evidence);
    aiMappings.set(requirementCode, {
      ...mapping,
      requirementCode,
      evidence,
      allVerified,
    });
  }

  const mappings = requirements.map((requirement) => aiMappings.get(requirement.code) ?? ({
    requirementCode: requirement.code,
    status: 'MISSING',
    rationale: 'The AI did not return a mapping for this requirement.',
    evidence: [],
    allVerified: false,
  }));

  const questions = output.questions.slice(0, MAX_SAVED_QUESTIONS).map((question) => ({
    ...question,
    requirementCode: question.requirementCode
      ? codeRemap.get(question.requirementCode) ?? null
      : null,
  }));
  const unsupportedClaims = output.unsupportedClaims
    .slice(0, MAX_SAVED_CLAIMS)
    .map((claim) => ({
      ...claim,
      quoteVerified: verifyQuote(applicationSegments, claim.segmentId, claim.quote),
    }));

  return { requirements, mappings, questions, unsupportedClaims };
}

export const analysisService = createAnalysisService();
