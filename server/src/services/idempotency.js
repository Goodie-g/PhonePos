import { prisma } from '../db.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Idempotency for mutating endpoints.
 *
 * Clients send an `Idempotency-Key` header (e.g. a UUID generated when the
 * user opens the form). The FIRST successful execution stores its response;
 * retries with the same key get the stored response instead of re-executing
 * (protects against double-taps and network retries).
 *
 * Usage: const { replay, result } = await idempotent(req, 'purchases.receive', () => doWork())
 */
export const idempotent = async (req, endpoint, work) => {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.length > 128) {
    // No key -> execute normally (idempotency is opt-in per request).
    const { body, statusCode = 201 } = await work();
    return { replayed: false, result: body, statusCode };
  }

  const scoped = { businessId: req.businessId, endpoint, key };
  const existing = await prisma.idempotencyKey.findUnique({
    where: { businessId_endpoint_key: scoped },
  });
  if (existing?.response) {
    return { replayed: true, result: existing.response, statusCode: existing.statusCode };
  }

  const { body, statusCode = 201 } = await work();

  try {
    await prisma.idempotencyKey.create({
      data: { ...scoped, response: body, statusCode },
    });
  } catch (err) {
    // Two concurrent requests with the same key: the unique constraint lets
    // exactly one through; the other must not silently double-execute.
    if (err?.code === 'P2002') {
      throw ApiError.conflict('A request with this idempotency key is being processed — retry in a moment');
    }
    throw err;
  }
  return { replayed: false, result: body, statusCode };
};
