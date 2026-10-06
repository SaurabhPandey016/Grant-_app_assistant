import { AppError } from './error-handler.js';

/**
 * @param {string[]} allowedOrigins
 * @returns {import('express').RequestHandler}
 */
export function corsMiddleware(allowedOrigins) {
  const allowlist = new Set(allowedOrigins);

  return (request, response, next) => {
    const origin = request.get('origin');
    if (!origin) {
      next();
      return;
    }

    if (!allowlist.has(origin)) {
      next(new AppError({
        code: 'CORS_ORIGIN_DENIED',
        message: 'This origin is not allowed.',
        httpStatus: 403,
      }));
      return;
    }

    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    response.vary('Origin');
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  };
}
