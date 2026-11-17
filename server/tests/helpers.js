import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';

export const prisma = new PrismaClient();
export const app = createApp();

/** Deletes every row in every table (order-safe via CASCADE + RESTART IDENTITY). */
export const resetDb = async () => {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

/** Registers a business and returns { accessToken, refreshToken, businessId, user }. */
export const registerOwner = async (overrides = {}) => {
  const body = {
    email: overrides.email ?? `owner-${Math.random().toString(36).slice(2, 10)}@test.dev`,
    password: overrides.password ?? 'password123',
    fullName: overrides.fullName ?? 'Test Owner',
    businessName: overrides.businessName ?? 'Test Business Ltd',
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.accessToken}`);
  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    user: res.body.user,
    businessId: me.body.memberships[0].businessId,
  };
};

/** Authorization + tenant headers for one call. */
export const as = (token, businessId) => ({
  Authorization: `Bearer ${token}`,
  'x-business-id': businessId,
});
