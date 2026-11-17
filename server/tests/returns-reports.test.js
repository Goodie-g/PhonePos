import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerOwner, as } from './helpers.js';
import { seedStock, createCustomer } from './catalogue.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

/** Creates a fulfilled + invoiced order: 1 phone + 2 cables. Returns ids. */
const setupSoldOrder = async (token, businessId) => {
  const c = await seedStock(token, businessId, { phones: 1, accessories: 10 });
  const h = as(token, businessId);
  const customer = await createCustomer(token, businessId);
  const draft = await request(app).post('/api/orders').set(h).send({
    customerId: customer.id, warehouseId: c.warehouse.id,
    items: [
      { variantId: c.phoneVariant.id, quantity: 1 },
      { variantId: c.accVariant.id, quantity: 2 },
    ],
  });
  const orderId = draft.body.data.id;
  await request(app).post(`/api/orders/${orderId}/submit`).set(h);
  await request(app).post(`/api/orders/${orderId}/confirm`).set(h);
  const order = (await request(app).get(`/api/orders/${orderId}`).set(h)).body.data;
  const phoneLine = order.items.find((i) => i.variantId === c.phoneVariant.id);
  const cableLine = order.items.find((i) => i.variantId === c.accVariant.id);
  const reserved = await prisma.device.findFirst({ where: { businessId, status: 'RESERVED' } });
  await request(app).post(`/api/orders/${orderId}/fulfil`).set(h).send({
    items: [
      { orderItemId: phoneLine.id, deviceIds: [reserved.id] },
      { orderItemId: cableLine.id, quantity: 2 },
    ],
  });
  const inv = await request(app).post('/api/invoices').set(h).send({ salesOrderId: orderId });
  await request(app).post(`/api/invoices/${inv.body.data.id}/payments`).set(h)
    .send({ amount: 200000, method: 'CASH' });
  return { ...c, customer, orderId, phoneLine, cableLine, deviceId: reserved.id };
};

describe('returns', () => {
  it('a returned phone is NOT resellable until inspected and restocked', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const s = await setupSoldOrder(accessToken, businessId);

    const ret = await request(app).post('/api/returns').set(h).send({
      salesOrderId: s.orderId, reason: 'Customer says device is faulty',
      items: [{ orderItemId: s.phoneLine.id, quantity: 1, deviceId: s.deviceId }],
    });
    expect(ret.status).toBe(201);
    const returnId = ret.body.data.id;

    // After return: phone is RETURNED (not AVAILABLE -> cannot be resold).
    let device = await prisma.device.findUnique({ where: { id: s.deviceId } });
    expect(device.status).toBe('RETURNED');
    let bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouse.id, variantId: s.phoneVariant.id } },
    });
    expect(bal.onHand).toBe(0); // no restock before inspection

    // Inspect: RESTOCK
    const retItems = (await request(app).get(`/api/returns/${returnId}`).set(h)).body.data.items;
    const insp = await request(app).post(`/api/returns/${returnId}/inspect`).set(h).send({
      items: [{ returnItemId: retItems[0].id, outcome: 'RESTOCK' }],
    });
    expect(insp.status).toBe(200);
    expect(insp.body.data.status).toBe('CLOSED');

    device = await prisma.device.findUnique({ where: { id: s.deviceId } });
    expect(device.status).toBe('AVAILABLE');
    bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouse.id, variantId: s.phoneVariant.id } },
    });
    expect(bal.onHand).toBe(1);

    // Record refund (once)
    const refund = await request(app).post(`/api/returns/${returnId}/refund`).set(h).send({ amount: 420000 });
    expect(refund.status).toBe(200);
    const refundAgain = await request(app).post(`/api/returns/${returnId}/refund`).set(h).send({ amount: 420000 });
    expect(refundAgain.status).toBe(409);
  });

  it('quarantined accessories do not re-enter stock', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const s = await setupSoldOrder(accessToken, businessId);

    const ret = await request(app).post('/api/returns').set(h).send({
      salesOrderId: s.orderId, reason: 'Defective cable batch',
      items: [{ orderItemId: s.cableLine.id, quantity: 1 }],
    });
    const retItems = (await request(app).get(`/api/returns/${ret.body.data.id}`).set(h)).body.data.items;
    await request(app).post(`/api/returns/${ret.body.data.id}/inspect`).set(h).send({
      items: [{ returnItemId: retItems[0].id, outcome: 'QUARANTINE' }],
    });
    const bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouse.id, variantId: s.accVariant.id } },
    });
    expect(bal.onHand).toBe(8); // 10 - 2 sold, quarantined unit not restocked
  });
});

describe('reports', () => {
  it('dashboard aggregates revenue, cash, outstanding from real records', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    await setupSoldOrder(accessToken, businessId);

    const dash = await request(app).get('/api/reports/dashboard').set(h);
    expect(dash.status).toBe(200);
    const d = dash.body.data;
    // 1 phone (420000) + 2 cables (8000) = 436000 invoiced; 200000 paid
    expect(Number(d.revenue)).toBe(436000);
    expect(Number(d.cashCollected)).toBe(200000);
    expect(Number(d.totalOutstanding)).toBe(236000);
    expect(d.invoicesIssued).toBe(1);

    const outstanding = await request(app).get('/api/reports/outstanding').set(h);
    expect(outstanding.body.data).toHaveLength(1);
    expect(Number(outstanding.body.data[0].outstanding)).toBe(236000);

    const stock = await request(app).get('/api/reports/stock').set(h);
    expect(stock.status).toBe(200);
    expect(Number(stock.body.summary.totalCostValue)).toBeGreaterThan(0);

    const best = await request(app).get('/api/reports/best-sellers').set(h);
    expect(best.body.data[0].unitsSold).toBe(2); // cables sold 2
  });

  it('tenant isolation: reports of business A never include business B data', async () => {
    const a = await registerOwner({ email: 'rep-a@test.dev' });
    const b = await registerOwner({ email: 'rep-b@test.dev' });
    await setupSoldOrder(a.accessToken, a.businessId);

    const dashB = await request(app).get('/api/reports/dashboard')
      .set(as(b.accessToken, b.businessId));
    expect(Number(dashB.body.data.revenue)).toBe(0);
    expect(dashB.body.data.invoicesIssued).toBe(0);
  });
});
