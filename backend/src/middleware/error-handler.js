import { logger } from '../lib/logger.js';

/**
 * @typedef {{ code: string, message: string, httpStatus: number, details?: unknown }} AppErrorShape
 */

export class AppError extends Error {
  /**
   * @param {AppErrorShape} options
   */
  constructor({ code, message, httpStatus, details }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/**
 * @param {Error & { code?: string, httpStatus?: number, details?: unknown }} error
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 */
export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const isAppError = error instanceof AppError;
  const isOversizedBody = error?.type === 'entity.too.large';
  const isInvalidJson = error?.type === 'entity.parse.failed';
  const httpStatus = isAppError ? error.httpStatus : isOversizedBody ? 413 : isInvalidJson ? 400 : 500;
  const code = isAppError
    ? error.code
    : isOversizedBody
      ? 'DOCUMENT_TOO_LARGE'
      : isInvalidJson
        ? 'INVALID_JSON'
        : 'INTERNAL_SERVER_ERROR';
  const message = isAppError
    ? error.message
    : isOversizedBody
      ? 'Request body is too large.'
      : isInvalidJson
        ? 'Request body must contain valid JSON.'
        : 'An unexpected error occurred.';
  const details = isAppError ? error.details : undefined;

  (request.log ?? logger).error(
    { errorCode: code, errorName: error?.name ?? 'Error' },
    'Request failed',
  );

  response.status(httpStatus).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: request.id,
    },
  });
}
