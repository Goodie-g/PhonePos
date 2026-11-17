import { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { ApiError } from '../utils/api-error.js';

/** 404 for unmatched API routes. */
export const notFound = (req, _res, next) =>
  next(new ApiError(404, 'NOT_FOUND', `No route: ${req.method} ${req.path}`));

/**
 * Central error handler — the ONLY place errors become HTTP responses.
 * Consistent shape: { error: { code, message, details? } }
 */
export const errorHandler = (err, _req, res, _next) => {
  // Known, intentional API errors
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // Prisma unique-constraint violation -> 409
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = err.meta?.target ?? [];
      return res.status(409).json({
        error: {
          code: 'DUPLICATE',
          message: `A record with this ${Array.isArray(fields) ? fields.join(', ') : 'value'} already exists`,
          details: fields,
        },
      });
    }
    if (err.code === 'P2025') {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Record not found or already changed' } });
    }
    if (err.code === 'P2003') {
      return res
        .status(409)
        .json({ error: { code: 'CONFLICT', message: 'Operation violates a related-record constraint' } });
    }
    // Serialization failure / deadlock under concurrency: safe to retry.
    if (err.code === 'P2034') {
      return res.status(409).json({
        error: { code: 'CONCURRENT_MODIFICATION', message: 'Concurrent update conflict — please retry the operation' },
      });
    }
  }

  // Anything else: log server-side, return a generic 500 (no stack traces).
  console.error('[unhandled]', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: config.isProd ? 'Something went wrong' : `Internal error: ${err.message}`,
    },
  });
};
