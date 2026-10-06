import OpenAI from 'openai';
import { env } from '../config/env.js';

/**
 * @typedef {{ promptTokens: number | null, completionTokens: number | null, totalTokens: number | null }} TokenUsage
 * @typedef {{ text: string, usage: TokenUsage, providerName: string, model: string }} JsonCompletion
 * @typedef {{ system: string, user: string }} JsonCompletionInput
 * @typedef {{ completeJson: (input: JsonCompletionInput) => Promise<JsonCompletion> }} JsonCompletionProvider
 */

/**
 * Creates an OpenAI Chat Completions-compatible JSON provider.
 * @param {{ baseURL?: string, apiKey?: string, model?: string, timeoutMs?: number, client?: OpenAI }} [options]
 * @returns {JsonCompletionProvider}
 */
export function createOpenAiCompatibleProvider({
  baseURL = env.LLM_BASE_URL,
  apiKey = env.LLM_API_KEY,
  model = env.LLM_MODEL,
  timeoutMs = env.LLM_TIMEOUT_MS,
  client,
} = {}) {
  if (!client && (!baseURL || !apiKey || !model)) {
    throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required for the live provider.');
  }

  const openai = client ?? new OpenAI({ baseURL, apiKey, timeout: timeoutMs, maxRetries: 0 });

  return {
    async completeJson({ system, user }) {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }, { timeout: timeoutMs, maxRetries: 0 });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new Error('The AI provider returned an empty response.');
      }

      return {
        text,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          totalTokens: completion.usage?.total_tokens ?? null,
        },
        providerName: 'openai-compatible',
        model: completion.model || model,
      };
    },
  };
}
