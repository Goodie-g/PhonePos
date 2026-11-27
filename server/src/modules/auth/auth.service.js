import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { prisma, withTransaction } from '../../db.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Token strategy (trade-offs documented in docs/AUTHENTICATION.md):
 *  - Access token: short-lived signed JWT, stateless to verify.
 *  - Refresh token: long random opaque string; only its SHA-256 hash is stored.
 *    Every refresh ROTATES the token (old one revoked + replacedBy pointer).
 *    Presenting a revoked token = theft signal -> all of the user's sessions
 *    are revoked.
 */

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, type: 'access' }, config.jwtSecret, {
    expiresIn: config.jwtAccessTtl,
  });

const issueRefreshToken = async (userId, req) => {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: req?.headers?.['user-agent']?.slice(0, 255) ?? null,
      ip: req?.ip ?? null,
    },
  });
  return token;
};

const publicUser = (user) => ({ id: user.id, email: user.email, fullName: user.fullName });

const tokensFor = async (user, req) => ({
  accessToken: signAccessToken(user),
  refreshToken: await issueRefreshToken(user.id, req),
});

/** Create a user + a new business with the user as OWNER, plus sane defaults. */
export const registerBusiness = async ({ email, password, fullName, businessName }, req) => {
  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const user = await withTransaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: normalizedEmail, passwordHash, fullName },
    });
    const business = await tx.business.create({
      data: {
        name: businessName,
        // Every business starts with one warehouse and one default price list,
        // so the app is usable in single-warehouse mode from minute one.
        warehouses: { create: { name: 'Main Warehouse', code: 'MAIN' } },
        priceLists: { create: { name: 'Standard Wholesale', isDefault: true } },
      },
    });
    await tx.membership.create({
      data: { userId: created.id, businessId: business.id, role: 'OWNER' },
    });
    return created;
  });

  const tokens = await tokensFor(user, req);
  return { user: publicUser(user), ...tokens };
};

export const login = async ({ email, password }, req) => {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Same error for unknown email and wrong password (no account enumeration).
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.unauthorized('Account is disabled');

  const tokens = await tokensFor(user, req);
  return { user: publicUser(user), ...tokens };
};

export const refresh = async ({ refreshToken }, req) => {
  const tokenHash = sha256(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // Reuse of an already-rotated token -> treat as compromise.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized('Refresh token reuse detected — all sessions revoked');
  }
  if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token expired');
  if (!stored.user.isActive) throw ApiError.unauthorized('Account is disabled');

  const newToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  await withTransaction(async (tx) => {
    const replacement = await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: sha256(newToken),
        expiresAt,
        userAgent: req?.headers?.['user-agent']?.slice(0, 255) ?? null,
        ip: req?.ip ?? null,
      },
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement.id },
    });
  });

  return {
    user: publicUser(stored.user),
    accessToken: signAccessToken(stored.user),
    refreshToken: newToken,
  };
};

export const logout = async ({ refreshToken }) => {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { business: true } } },
  });
  if (!user) throw ApiError.unauthorized('Account unavailable');
  return {
    user: publicUser(user),
    memberships: user.memberships.map((m) => ({
      businessId: m.businessId,
      businessName: m.business.name,
      currency: m.business.currency,
      role: m.role,
    })),
  };
};
