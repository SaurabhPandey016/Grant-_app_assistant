import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { createHeuristicProvider } from './heuristicProvider.js';
import {
  ClaimsAndQuestionsOutput,
  MappingOutput,
  RequirementsOutput,
} from './schemas.js';
import { createOpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { runStructured } from './runStructured.js';
import {
  PROMPT_VERSION,
  buildClaimsAndQuestionsPrompt,
  buildMappingPrompt,
  buildRequirementsPrompt,
} from './prompts/index.js';

/**
 * @typedef {import('./heuristicProvider.js').createHeuristicProvider extends (...args: never[]) => infer Provider ? Provider : never} AiProvider
 */

/**
 * @param {{ configuredProvider?: AiProvider, heuristicProvider?: AiProvider, logger?: import('pino').Logger }} [options]
 */
export function createAiService({
  configuredProvider,
  heuristicProvider,
  logger: log = logger,
} = {}) {
  const localProvider = heuristicProvider ?? createHeuristicProvider({ providerName: 'heuristic' });
  const useOfflineProvider = !configuredProvider && env.LLM_PROVIDER === 'heuristic';
  const selectedProvider = configuredProvider ?? (useOfflineProvider
    ? localProvider
    : createOpenAiCompatibleProvider());
  const fallbackProvider = useOfflineProvider
    ? undefined
    : heuristicProvider ?? createHeuristicProvider({ providerName: 'heuristic-fallback' });

  async function runAnalysis({ guidelineSegments, applicationSegments }) {
    validateSegments(guidelineSegments, 'guideline');
    validateSegments(applicationSegments, 'application');

    try {
      return await runPipeline(selectedProvider, undefined, guidelineSegments, applicationSegments);
    } catch (error) {
      if (!fallbackProvider || error?.code !== 'AI_PROVIDER_UNAVAILABLE') {
        throw error;
      }
      const result = await runPipeline(
        fallbackProvider,
        undefined,
        guidelineSegments,
        applicationSegments,
      );
      return { ...result, aiUnavailable: true };
    }
  }

  async function runPipeline(provider, stepFallback, guidelineSegments, applicationSegments) {
    const metadata = [];
    const requirementsPrompt = buildRequirementsPrompt(guidelineSegments);
    const requirementResult = await runStructured({
      provider,
      fallbackProvider: stepFallback,
      schema: RequirementsOutput,
      ...requirementsPrompt,
      promptVersion: PROMPT_VERSION,
      logger: log,
    });
    metadata.push(requirementResult);

    const requirements = requirementResult.data.requirements.map((requirement, index) => ({
      code: `R${index + 1}`,
      ...requirement,
    }));
    const mappingPrompt = buildMappingPrompt(guidelineSegments, applicationSegments, requirements);
    const mappingResult = await runStructured({
      provider,
      fallbackProvider: stepFallback,
      schema: MappingOutput,
      ...mappingPrompt,
      promptVersion: PROMPT_VERSION,
      logger: log,
    });
    metadata.push(mappingResult);

    const claimsPrompt = buildClaimsAndQuestionsPrompt(
      guidelineSegments,
      applicationSegments,
      requirements,
      mappingResult.data.mappings,
    );
    const claimsResult = await runStructured({
      provider,
      fallbackProvider: stepFallback,
      schema: ClaimsAndQuestionsOutput,
      ...claimsPrompt,
      promptVersion: PROMPT_VERSION,
      logger: log,
    });
    metadata.push(claimsResult);

    const usage = metadata.reduce((sum, result) => ({
      promptTokens: addUsage(sum.promptTokens, result.usage.promptTokens),
      completionTokens: addUsage(sum.completionTokens, result.usage.completionTokens),
      totalTokens: addUsage(sum.totalTokens, result.usage.totalTokens),
    }), { ...metadata[0].usage });
    const usedFallback = provider === fallbackProvider;

    return {
      requirements,
      mappings: mappingResult.data.mappings,
      unsupportedClaims: claimsResult.data.unsupportedClaims,
      questions: claimsResult.data.questions,
      provider: usedFallback
        ? 'heuristic-fallback'
        : requirementResult.providerName,
      model: usedFallback ? 'deterministic-rules-v1' : requirementResult.model,
      promptVersion: PROMPT_VERSION,
      usage,
      aiUnavailable: provider === fallbackProvider,
    };
  }

  return { runAnalysis };
}

function addUsage(total, next) {
  return total === null || next === null ? null : total + next;
}

function validateSegments(segments, kind) {
  if (!Array.isArray(segments) || segments.some((segment) => (
    typeof segment?.id !== 'string' || typeof segment?.text !== 'string'
  ))) {
    throw new AppError({
      code: 'INVALID_DOCUMENT_SEGMENTS',
      message: `The ${kind} document segments are invalid.`,
      httpStatus: 400,
    });
  }
}

export const aiService = createAiService();
