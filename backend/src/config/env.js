import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65535).default(10000),
  ),
  LOG_LEVEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.preprocess(
    (value) => (value === undefined || value === '' ? 'false' : value),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ),
  CORS_ORIGINS: z.preprocess(
    (value) => (value === '' || value === undefined ? [] : value),
    z.union([
      z.array(z.string()),
      z.string().transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
    ]).pipe(
      z.array(z.string().url())
        .refine(
          (origins) => origins.every((origin) => new URL(origin).origin === origin),
          'CORS_ORIGINS must contain origins without paths.',
        )
        .transform((origins) => [...new Set(origins)]),
    ),
  ).default([]),
  LLM_PROVIDER: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['heuristic', 'openai-compatible']).default('heuristic'),
  ),
  LLM_BASE_URL: z.preprocess((value) => (value === '' ? undefined : value), z.string().url().optional()),
  LLM_API_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
  LLM_MODEL: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
});

const parsedEnv = envSchema.parse(process.env);

if (
  parsedEnv.LLM_PROVIDER === 'openai-compatible'
  && (!parsedEnv.LLM_BASE_URL || !parsedEnv.LLM_API_KEY || !parsedEnv.LLM_MODEL)
) {
  throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required for openai-compatible LLM_PROVIDER.');
}

export const env = parsedEnv;
