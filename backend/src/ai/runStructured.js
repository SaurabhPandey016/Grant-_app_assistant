import { AppError } from '../middleware/error-handler.js';
import { logger as defaultLogger } from '../lib/logger.js';

const EMPTY_USAGE = { promptTokens: null, completionTokens: null, totalTokens: null };

/**
 * @typedef {import('./openAiCompatibleProvider.js').JsonCompletionProvider} JsonCompletionProvider
 * @typedef {{ parse: (value: unknown) => unknown, safeParse: (value: unknown) => { success: boolean, data?: unknown, error?: { issues: Array<{ code: string, path: Array<string | number> }> } } }} RuntimeSchema
 */

/**
 * Calls a JSON provider, parses optional Markdown fences, validates the response,
 * and retries exactly once with concise validation paths on output errors.
 * A provider transport failure is retried once, then optionally handled by the
 * deterministic fallback provider.
 *
 * @template T
 * @param {{
 *   provider: JsonCompletionProvider,
 *   fallbackProvider?: JsonCompletionProvider,
 *   schema: RuntimeSchema,
 *   system: string,
 *   user: string,
 *   promptVersion: string,
 *   logger?: import('pino').Logger
 * }} options
 * @returns {Promise<{ data: T, providerName: string, model: string, usage: import('./openAiCompatibleProvider.js').TokenUsage }>}
 */
export async function runStructured({
  provider,
  fallbackProvider,
  schema,
  system,
  user,
  promptVersion,
  logger = defaultLogger,
}) {
  let validationIssues = null;
  let lastProviderError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    let completion;
    try {
      completion = await provider.completeJson({
        system,
        user: validationIssues
          ? `${user}\n\nYour previous response did not match the required JSON schema. Correct these validation errors and return only JSON: ${JSON.stringify(validationIssues)}`
          : user,
      });
    } catch {
      lastProviderError = true;
      logger.warn({
        provider: 'live',
        model: 'configured',
        promptVersion,
        durationMs: Date.now() - startedAt,
        attempt,
      }, 'AI provider request failed');
      if (attempt === 1) continue;
      break;
    }

    const parsed = parseAndValidate(completion.text, schema);
    if (parsed.success) {
      logger.info({
        provider: completion.providerName,
        model: completion.model,
        promptVersion,
        durationMs: Date.now() - startedAt,
        usage: completion.usage ?? EMPTY_USAGE,
      }, 'AI structured call completed');
      return {
        data: parsed.data,
        providerName: completion.providerName,
        model: completion.model,
        usage: completion.usage ?? EMPTY_USAGE,
      };
    }

    validationIssues = parsed.issues;
    logger.warn({
      provider: completion.providerName,
      model: completion.model,
      promptVersion,
      durationMs: Date.now() - startedAt,
      attempt,
      validationIssueCount: validationIssues.length,
    }, 'AI response failed schema validation');
  }

  if (validationIssues) {
    throw new AppError({
      code: 'AI_OUTPUT_INVALID',
      message: 'The AI provider returned output that did not match the required schema.',
      httpStatus: 502,
      details: { validationIssues },
    });
  }

  if (lastProviderError && fallbackProvider) {
    const startedAt = Date.now();
    let completion;
    try {
      completion = await fallbackProvider.completeJson({ system, user });
    } catch {
      throw providerUnavailableError();
    }

    const parsed = parseAndValidate(completion.text, schema);
    if (!parsed.success) {
      throw new AppError({
        code: 'AI_OUTPUT_INVALID',
        message: 'The fallback provider returned output that did not match the required schema.',
        httpStatus: 502,
        details: { validationIssues: parsed.issues },
      });
    }

    logger.warn({
      provider: completion.providerName,
      model: completion.model,
      promptVersion,
      durationMs: Date.now() - startedAt,
      usage: completion.usage ?? EMPTY_USAGE,
    }, 'AI provider unavailable; deterministic fallback used');
    return {
      data: parsed.data,
      providerName: completion.providerName,
      model: completion.model,
      usage: completion.usage ?? EMPTY_USAGE,
    };
  }

  throw providerUnavailableError();
}

function parseAndValidate(text, schema) {
  let json;
  try {
    json = JSON.parse(extractJsonText(text));
  } catch {
    return {
      success: false,
      issues: [{ code: 'invalid_json', path: [] }],
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
      })),
    };
  }
  return { success: true, data: result.data };
}

function extractJsonText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  if (start === -1) {
    return text.trim();
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return text.trim();
}

function providerUnavailableError() {
  return new AppError({
    code: 'AI_PROVIDER_UNAVAILABLE',
    message: 'The AI provider is unavailable. Please try again later.',
    httpStatus: 503,
  });
}
