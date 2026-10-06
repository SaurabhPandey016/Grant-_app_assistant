/**
 * @typedef {(request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} AsyncRoute
 */

/**
 * @param {AsyncRoute} handler
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
