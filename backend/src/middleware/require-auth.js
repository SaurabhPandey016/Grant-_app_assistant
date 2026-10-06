import { AppError } from './error-handler.js';
import { authCookieName } from '../lib/auth-cookie.js';

/**
 * @param {{ authenticate: (token: string) => Promise<{ id: string, email: string, name: string } | null> }} authService
 * @returns {import('express').RequestHandler}
 */
export function requireAuth(authService) {
  return async (request, response, next) => {
    const authorization = request.get('authorization');
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch ? bearerMatch[1] : request.cookies?.[authCookieName];

    if (!token) {
      next(unauthorizedError());
      return;
    }

    try {
      const user = await authService.authenticate(token);
      if (!user) {
        next(unauthorizedError());
        return;
      }
      request.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function unauthorizedError() {
  return new AppError({
    code: 'UNAUTHENTICATED',
    message: 'Authentication required.',
    httpStatus: 401,
  });
}
