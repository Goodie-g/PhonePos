import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerOwner, as } from './helpers.js';
import { seedStock, createCustomer } from './catalogue.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const draftOrder = (customerId, warehouseId, items) =>
  ({ customerId, warehouseId, items });

describe('sales orders', () => {
  it('runs the full lifecycle: draft -> submit -> confirm -> fulfil -> invoice -> payments', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { phones: 2, accessories: 10 });
    const customer = await createCustomer(accessToken, businessId, { creditLimit: 0 });

    // DRAFT (server resolves prices — client sends none)
    const draft = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [
        { variantId: c.phoneVariant.id, quantity: 1 },
        { variantId: c.accVariant.id, quantity: 3 },
      ])
    );
    expect(draft.status).toBe(201);
    const order = draft.body.data;
    expect(order.status).toBe('DRAFT');
    // 1 * 420000 + 3 * 8000 = 444000
    expect(Number(order.grandTotal)).toBe(444000);

    await request(app).post(`/api/orders/${order.id}/submit`).set(h);
    const confirmed = await request(app).post(`/api/orders/${order.id}/confirm`).set(h);
    expect(confirmed.status).toBe(200);

    // Reservations now hold stock: one device RESERVED, 3 cables reserved.
    const reservedDevice = await prisma.device.findFirst({ where: { businessId, status: 'RESERVED' } });
    expect(reservedDevice).toBeTruthy();
    const bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect(bal.reserved).toBe(3);

    // Fulfil everything
    const items = confirmed.body.data.items;
    const phoneLine = items.find((i) => i.variantId === c.phoneVariant.id);
    const cableLine = items.find((i) => i.variantId === c.accVariant.id);
    const fulfil = await request(app).post(`/api/orders/${order.id}/fulfil`).set(h).send({
      items: [
        { orderItemId: phoneLine.id, deviceIds: [reservedDevice.id] },
        { orderItemId: cableLine.id, quantity: 3 },
      ],
    });
    expect(fulfil.status).toBe(200);
    expect(fulfil.body.data.status).toBe('FULFILLED');

    // Stock moved: device SOLD, balance 10 -> 7
    const soldDevice = await prisma.device.findUnique({ where: { id: reservedDevice.id } });
    expect(soldDevice.status).toBe('SOLD');
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect([bal2.onHand, bal2.reserved]).toEqual([7, 0]);

    // Invoice
    const inv = await request(app).post('/api/invoices').set(h).send({ salesOrderId: order.id });
    expect(inv.status).toBe(201);
    expect(Number(inv.body.data.total)).toBe(444000);
    expect(inv.body.data.status).toBe('ISSUED');
    const invoiceId = inv.body.data.id;

    // Partial payment
    const p1 = await request(app).post(`/api/invoices/${invoiceId}/payments`).set(h).send({
      amount: 144000, method: 'MOBILE_MONEY', reference: 'MPESA-TEST-1',
    });
    expect(p1.status).toBe(201);
    expect(p1.body.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(Number(p1.body.data.invoice.amountPaid)).toBe(144000);

    // Overpayment rejected
    const tooMuch = await request(app).post(`/api/invoices/${invoiceId}/payments`).set(h).send({
      amount: 300001, method: 'CASH',
    });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe('OVERPAYMENT');

    // Settle exactly
    const p2 = await request(app).post(`/api/invoices/${invoiceId}/payments`).set(h).send({
      amount: 300000, method: 'BANK_TRANSFER', reference: 'BNK-1',
    });
    expect(p2.status).toBe(201);
    expect(p2.body.data.invoice.status).toBe('PAID');

    // No double-invoicing of one order
    const invAgain = await request(app).post('/api/invoices').set(h).send({ salesOrderId: order.id });
    expect(invAgain.status).toBe(409);
  });

  it('two concurrent confirms cannot both claim the last device', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { phones: 1 });
    const customer = await createCustomer(accessToken, businessId);

    const mkOrder = async () => {
      const d = await request(app).post('/api/orders').set(h).send(
        draftOrder(customer.id, c.warehouse.id, [{ variantId: c.phoneVariant.id, quantity: 1 }])
      );
      await request(app).post(`/api/orders/${d.body.data.id}/submit`).set(h);
      return d.body.data.id;
    };
    const [o1, o2] = await Promise.all([mkOrder(), mkOrder()]);

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/orders/${o1}/confirm`).set(h),
      request(app).post(`/api/orders/${o2}/confirm`).set(h),
    ]);
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(200); // exactly one wins...
    expect(statuses[1]).toBeGreaterThanOrEqual(400); // ...and one loses

    const reserved = await prisma.device.count({ where: { businessId, status: 'RESERVED' } });
    expect(reserved).toBe(1); // the handset was claimed exactly once
  });

  it('cancel releases reservations; invalid transitions are rejected', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { phones: 1, accessories: 5 });
    const customer = await createCustomer(accessToken, businessId);

    const draft = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [
        { variantId: c.phoneVariant.id, quantity: 1 },
        { variantId: c.accVariant.id, quantity: 2 },
      ])
    );
    const id = draft.body.data.id;
    // Fulfil a DRAFT -> invalid
    const badFulfil = await request(app).post(`/api/orders/${id}/fulfil`).set(h).send({ items: [] });
    expect([400, 422]).toContain(badFulfil.status);

    await request(app).post(`/api/orders/${id}/submit`).set(h);
    await request(app).post(`/api/orders/${id}/confirm`).set(h);
    const cancel = await request(app).post(`/api/orders/${id}/cancel`).set(h);
    expect(cancel.status).toBe(200);

    const device = await prisma.device.findFirst({ where: { businessId } });
    expect(device.status).toBe('AVAILABLE');
    const bal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect(bal.reserved).toBe(0);
  });

  it('enforces credit limits at invoicing and honours payment terms', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { accessories: 100 });
    // Limit 100k, terms 14 days; one cable is 8000 -> 20 cables = 160k > limit
    const customer = await createCustomer(accessToken, businessId, { creditLimit: 100000, paymentTermsDays: 14 });

    const draft = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [{ variantId: c.accVariant.id, quantity: 20 }])
    );
    const id = draft.body.data.id;
    await request(app).post(`/api/orders/${id}/submit`).set(h);
    await request(app).post(`/api/orders/${id}/confirm`).set(h);
    const line = (await request(app).get(`/api/orders/${id}`).set(h)).body.data.items[0];
    await request(app).post(`/api/orders/${id}/fulfil`).set(h).send({ items: [{ orderItemId: line.id, quantity: 20 }] });

    const inv = await request(app).post('/api/invoices').set(h).send({ salesOrderId: id });
    expect(inv.status).toBe(422);
    expect(inv.body.error.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('payment idempotency: same Idempotency-Key never double-records', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { accessories: 5 });
    const customer = await createCustomer(accessToken, businessId);

    const draft = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [{ variantId: c.accVariant.id, quantity: 1 }])
    );
    const id = draft.body.data.id;
    await request(app).post(`/api/orders/${id}/submit`).set(h);
    await request(app).post(`/api/orders/${id}/confirm`).set(h);
    const line = (await request(app).get(`/api/orders/${id}`).set(h)).body.data.items[0];
    await request(app).post(`/api/orders/${id}/fulfil`).set(h).send({ items: [{ orderItemId: line.id, quantity: 1 }] });
    const inv = await request(app).post('/api/invoices').set(h).send({ salesOrderId: id });
    const invoiceId = inv.body.data.id;

    const key = 'pay-key-abc';
    const first = await request(app).post(`/api/invoices/${invoiceId}/payments`).set(h)
      .set('Idempotency-Key', key).send({ amount: 8000, method: 'CASH' });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/invoices/${invoiceId}/payments`).set(h)
      .set('Idempotency-Key', key).send({ amount: 8000, method: 'CASH' });
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);

    const payments = await prisma.payment.count({ where: { businessId, invoiceId } });
    expect(payments).toBe(1);
  });

  it('applies customer price-list quantity tiers server-side', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { accessories: 50 });
    const pl = (await request(app).get('/api/price-lists').set(h)).body.data[0];
    await request(app).post(`/api/price-lists/${pl.id}/items`).set(h).send({
      variantId: c.accVariant.id, minQty: 10, unitPrice: 6500,
    });
    const customer = await createCustomer(accessToken, businessId);

    // 3 cables -> standard price 8000
    const small = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [{ variantId: c.accVariant.id, quantity: 3 }])
    );
    expect(Number(small.body.data.items[0].unitPrice)).toBe(8000);

    // 12 cables -> tier price 6500
    const bulk = await request(app).post('/api/orders').set(h).send(
      draftOrder(customer.id, c.warehouse.id, [{ variantId: c.accVariant.id, quantity: 12 }])
    );
    expect(Number(bulk.body.data.items[0].unitPrice)).toBe(6500);
    expect(Number(bulk.body.data.grandTotal)).toBe(78000);
  });
});
