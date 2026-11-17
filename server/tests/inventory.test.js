import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerOwner, as } from './helpers.js';
import { makeImei, seedCatalogue, createAndSubmitPO } from './catalogue.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('catalogue', () => {
  it('creates products and variants; rejects duplicate SKU with 409', async () => {
    const { accessToken, businessId } = await registerOwner();
    const c = await seedCatalogue(accessToken, businessId);
    const dup = await request(app)
      .post(`/api/products/${c.phone.id}/variants`)
      .set(as(accessToken, businessId))
      .send({ sku: 'A15-128-BLK', sellPrice: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });

  it('does not let another business read the catalogue', async () => {
    const a = await registerOwner({ email: 'cat-a@test.dev' });
    const b = await registerOwner({ email: 'cat-b@test.dev' });
    await seedCatalogue(a.accessToken, a.businessId);
    const list = await request(app).get('/api/products').set(as(b.accessToken, b.businessId));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    // Cross-tenant by id -> 404 (not 403, to avoid leaking existence).
    const one = await request(app)
      .get(`/api/products/${(await request(app).get('/api/products').set(as(a.accessToken, a.businessId))).body.data[0].id}`)
      .set(as(b.accessToken, b.businessId));
    expect(one.status).toBe(404);
  });
});

describe('purchasing & receiving', () => {
  it('receiving accessories increments stock and writes ledger entries; over-receiving is rejected', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedCatalogue(accessToken, businessId);
    const po = await createAndSubmitPO(accessToken, businessId, c.supplier.id, [
      { variantId: c.accVariant.id, quantity: 10, unitCost: 3000 },
    ]);
    const poItemId = po.items[0].id;

    // Receive 6 of 10 -> PARTIALLY_RECEIVED
    const r1 = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id, items: [{ purchaseOrderItemId: poItemId, quantity: 6 }],
    });
    expect(r1.status).toBe(201);
    expect(r1.body.data.status).toBe('PARTIALLY_RECEIVED');

    const bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect(bal.onHand).toBe(6);

    // Over-receive the remaining 4 -> 422
    const r2 = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id, items: [{ purchaseOrderItemId: poItemId, quantity: 5 }],
    });
    expect(r2.status).toBe(422);
    expect(r2.body.error.code).toBe('OVER_RECEIVE');

    // Receive the rest -> RECEIVED
    const r3 = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id, items: [{ purchaseOrderItemId: poItemId, quantity: 4 }],
    });
    expect(r3.status).toBe(201);
    expect(r3.body.data.status).toBe('RECEIVED');

    const movements = await prisma.stockMovement.findMany({
      where: { businessId, variantId: c.accVariant.id, type: 'RECEIPT' },
    });
    expect(movements).toHaveLength(2);
    expect(movements.reduce((s, m) => s + m.quantity, 0)).toBe(10);
  });

  it('registers IMEI devices, rejects duplicates and invalid IMEIs', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedCatalogue(accessToken, businessId);
    const po = await createAndSubmitPO(accessToken, businessId, c.supplier.id, [
      { variantId: c.phoneVariant.id, quantity: 2, unitCost: 320000 },
    ]);
    const poItemId = po.items[0].id;
    const imei1 = makeImei('35912345000001');
    const imei2 = makeImei('35912345000002');

    // Invalid check digit -> 400 (mutate the valid IMEI's last digit)
    const invalidImei = `${imei1.slice(0, 14)}${(Number(imei1[14]) + 1) % 10}`;
    const bad = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id,
      devices: [{ purchaseOrderItemId: poItemId, imei1: invalidImei }],
    });
    expect(bad.status).toBe(400);

    // Receive both phones
    const ok = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id,
      devices: [
        { purchaseOrderItemId: poItemId, imei1 },
        { purchaseOrderItemId: poItemId, imei1: imei2 },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('RECEIVED');

    const devices = await prisma.device.findMany({ where: { businessId } });
    expect(devices).toHaveLength(2);
    expect(devices.every((d) => d.status === 'RECEIVED')).toBe(true);

    // Same IMEI again (even in another PO of another business) -> 409
    const po2 = await createAndSubmitPO(accessToken, businessId, c.supplier.id, [
      { variantId: c.phoneVariant.id, quantity: 1, unitCost: 320000 },
    ]);
    const dup = await request(app).post(`/api/purchases/${po2.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id,
      devices: [{ purchaseOrderItemId: po2.items[0].id, imei1 }],
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('creating a PO does NOT change stock; receive is idempotent with Idempotency-Key', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedCatalogue(accessToken, businessId);
    const po = await createAndSubmitPO(accessToken, businessId, c.supplier.id, [
      { variantId: c.accVariant.id, quantity: 5, unitCost: 3000 },
    ]);
    let bal = await prisma.inventoryBalance.findFirst({
      where: { warehouseId: c.warehouse.id, variantId: c.accVariant.id },
    });
    expect(bal).toBeNull(); // nothing received yet

    const key = 'recv-key-123';
    const payload = { warehouseId: c.warehouse.id, items: [{ purchaseOrderItemId: po.items[0].id, quantity: 5 }] };
    const first = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).set('Idempotency-Key', key).send(payload);
    expect(first.status).toBe(201);
    const replay = await request(app).post(`/api/purchases/${po.id}/receive`).set(h).set('Idempotency-Key', key).send(payload);
    expect(replay.status).toBe(201);

    bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect(bal.onHand).toBe(5); // received once, not twice
  });
});

describe('manual adjustments', () => {
  it('never lets stock go negative and requires a reason', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedCatalogue(accessToken, businessId);
    const po = await createAndSubmitPO(accessToken, businessId, c.supplier.id, [
      { variantId: c.accVariant.id, quantity: 3, unitCost: 3000 },
    ]);
    await request(app).post(`/api/purchases/${po.id}/receive`).set(h).send({
      warehouseId: c.warehouse.id, items: [{ purchaseOrderItemId: po.items[0].id, quantity: 3 }],
    });

    const neg = await request(app).post('/api/inventory/adjustments').set(h).send({
      warehouseId: c.warehouse.id, variantId: c.accVariant.id, delta: -4, reason: 'theft',
    });
    expect(neg.status).toBe(422);
    expect(neg.body.error.code).toBe('INSUFFICIENT_STOCK');

    const noReason = await request(app).post('/api/inventory/adjustments').set(h).send({
      warehouseId: c.warehouse.id, variantId: c.accVariant.id, delta: -1,
    });
    expect(noReason.status).toBe(400);

    const ok = await request(app).post('/api/inventory/adjustments').set(h).send({
      warehouseId: c.warehouse.id, variantId: c.accVariant.id, delta: -2, reason: 'damaged packaging',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.onHand).toBe(1);
  });
});
