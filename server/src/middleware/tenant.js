import { prisma } from '../db.js';
import { ApiError, ah } from '../utils/api-error.js';
import { roleAllows } from '../auth/permissions.js';

/**
 * Resolves the business (tenant) context for the request.
 *
 * The client passes `x-business-id` to say WHICH of the user's businesses it
 * wants to act on; we then verify the user is actually a member. The business
 * id is therefore *derived from a verified membership*, never trusted blindly.
 * Services must always use req.businessId in their queries.
 */
export const resolveBusiness = ah(async (req, _res, next) => {
  const businessId = req.headers['x-business-id'];
  if (!businessId || typeof businessId !== 'string') {
    throw ApiError.badRequest('Missing x-business-id header');
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: req.user.id, businessId } },
  });
  if (!membership) {
    // Deliberately 403 (not 404): we do not confirm whether the business exists.
    throw ApiError.forbidden('You are not a member of this business');
  }
  req.businessId = businessId;
  req.membership = membership;
  next();
});

/** Require a permission on the resolved membership's role. */
export const requirePermission = (permission) =>
  ah(async (req, _res, next) => {
    if (!req.membership) throw ApiError.forbidden('No business context');
    if (!roleAllows(req.membership.role, permission)) {
      throw ApiError.forbidden(`Missing permission: ${permission}`);
    }
    next();
  });
