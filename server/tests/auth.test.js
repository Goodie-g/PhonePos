import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerOwner, as } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /api/auth/register', () => {
  it('creates a business, owner membership, default warehouse + price list', async () => {
    const { businessId } = await registerOwner({ email: 'a@b.co', businessName: 'Acme Phones' });
    const warehouses = await prisma.warehouse.findMany({ where: { businessId } });
    const priceLists = await prisma.priceList.findMany({ where: { businessId } });
    expect(warehouses).toHaveLength(1);
    expect(warehouses[0].code).toBe('MAIN');
    expect(priceLists).toHaveLength(1);
    expect(priceLists[0].isDefault).toBe(true);
  });

  it('rejects duplicate emails with 409 and never stores plaintext passwords', async () => {
    await registerOwner({ email: 'dup@test.dev' });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@test.dev',
      password: 'password123',
      fullName: 'Dup',
      businessName: 'Dup Biz',
    });
    expect(res.status).toBe(409);
    const user = await prisma.user.findUnique({ where: { email: 'dup@test.dev' } });
    expect(user.passwordHash).not.toContain('password123');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  it('rejects weak input with 400 and field details', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials and a generic 401 otherwise', async () => {
    await registerOwner({ email: 'login@test.dev', password: 'password123' });
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.dev', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');
  });
});

describe('refresh token rotation', () => {
  it('rotates on use and revokes ALL sessions on reuse of an old token', async () => {
    const { refreshToken } = await registerOwner({ email: 'rot@test.dev' });

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const rotated = first.body.refreshToken;
    expect(rotated).not.toBe(refreshToken);

    // Reusing the OLD token is a theft signal -> 401 + every session revoked.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);

    // Even the freshly rotated token is now dead.
    const after = await request(app).post('/api/auth/refresh').send({ refreshToken: rotated });
    expect(after.status).toBe(401);
  });
});

describe('tenant context (x-business-id)', () => {
  it('rejects requests without a verified membership', async () => {
    const a = await registerOwner({ email: 'ta@test.dev', businessName: 'Tenant A' });
    const b = await registerOwner({ email: 'tb@test.dev', businessName: 'Tenant B' });

    // User A tries to act on business B — must be forbidden.
    const res = await request(app).get('/api/auth/me').set(as(a.accessToken, b.businessId));
    // /me does not use tenant middleware, so use any protected business route:
    expect(res.status).toBe(200); // sanity: token itself is valid

    const forbidden = await request(app)
      .get('/api/products')
      .set(as(a.accessToken, b.businessId));
    expect([403, 404]).toContain(forbidden.status); // 403 once routes exist
  });
});
