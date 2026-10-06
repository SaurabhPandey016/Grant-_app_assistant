import { z } from 'zod';
import { AppError } from './error-handler.js';

const pathParameterSchema = z.string().min(1).max(128);

/**
 * @returns {import('express').ParamHandler}
 */
export function validatePathParam() {
  return (request, response, next, value) => {
    const parsed = pathParameterSchema.safeParse(value);
    if (!parsed.success) {
      next(new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Invalid route parameter.',
        httpStatus: 400,
        details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
      }));
      return;
    }
    next();
  };
}
