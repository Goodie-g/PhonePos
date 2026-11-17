import { ApiError } from '../utils/api-error.js';

/**
 * Validates request parts against a zod schema:
 *   validate({ body: schema, query: schema, params: schema })
 * Parsed (and coerced) values replace the raw ones, so handlers only ever see
 * clean, typed data. Unknown query keys are stripped by default zod objects.
 */
export const validate =
  ({ body, query, params }) =>
  (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (query) req.query = query.parse(req.query ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      next();
    } catch (err) {
      if (err?.issues) {
        const details = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        next(ApiError.badRequest('Validation failed', details));
      } else {
        next(err);
      }
    }
  };
