import { z } from 'zod';
import { authCookieName, authCookieOptions, authTokenLifetimeMs } from '../lib/auth-cookie.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../middleware/error-handler.js';
import { serializeUser } from '../serializers/auth.serializer.js';

const passwordSchema = z.string().min(12).max(72).refine(
  (password) => Buffer.byteLength(password, 'utf8') <= 72,
  'Password must not exceed 72 UTF-8 bytes.',
);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: passwordSchema,
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
}).strict();

function parseBody(schema, body) {
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

function setAuthCookie(response, token) {
  response.cookie(authCookieName, token, {
    ...authCookieOptions,
    maxAge: authTokenLifetimeMs,
  });
}

export function createAuthController(service = authService) {
  return {
    async register(request, response) {
      const credentials = parseBody(registerSchema, request.body);
      const result = await service.register(credentials);
      setAuthCookie(response, result.token);
      response.status(201).json({ user: serializeUser(result.user) });
    },

    async login(request, response) {
      const credentials = parseBody(loginSchema, request.body);
      const result = await service.login(credentials);
      setAuthCookie(response, result.token);
      response.status(200).json({ user: serializeUser(result.user) });
    },

    logout(request, response) {
      response.clearCookie(authCookieName, authCookieOptions);
      response.status(204).end();
    },

    me(request, response) {
      response.status(200).json({ user: serializeUser(request.user) });
    },
  };
}
