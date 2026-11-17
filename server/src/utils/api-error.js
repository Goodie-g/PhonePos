/**
 * ApiError — the one error type route handlers and services throw.
 *
 * Every error the API returns on purpose has:
 *  - an HTTP status code
 *  - a stable machine-readable `code` (clients switch on this, not the message)
 *  - a human-readable message (safe to show a user)
 *  - optional `details` (e.g. zod field errors)
 *
 * The central error handler turns unexpected errors into a generic 500 so we
 * never leak stack traces or internals to clients.
 */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message, details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static unprocessable(code, message, details) {
    // Business-rule violation (insufficient stock, invalid transition, ...)
    return new ApiError(422, code, message, details);
  }
}

/** Wrap async route handlers so rejections reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
