import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { ApiError, ah } from '../utils/api-error.js';

/**
 * Verifies the `Authorization: Bearer <access-token>` header.
 * Attaches req.user = { id, email, fullName }.
 * Does NOT decide tenant or permissions — that is tenant.js / authorize.js.
 */
export const authenticate = ah(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  if (payload.type !== 'access') throw ApiError.unauthorized('Wrong token type');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw ApiError.unauthorized('Account unavailable');

  req.user = { id: user.id, email: user.email, fullName: user.fullName };
  next();
});
