import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerOwner, as } from './helpers.js';
import { seedStock, createCustomer } from './catalogue.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const secondWarehouse = async (token, businessId) => {
  const res = await request(app).post('/api/warehouses').set(as(token, businessId))
    .send({ name: 'Arusha Branch', code: 'ARS' });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data;
};

describe('stock transfers', () => {
  it('moves accessories between warehouses without creating or destroying stock', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { accessories: 10 });
    const dest = await secondWarehouse(accessToken, businessId);

    const t = await request(app).post('/api/transfers').set(h).send({
      fromWarehouseId: c.warehouse.id, toWarehouseId: dest.id,
      items: [{ variantId: c.accVariant.id, quantity: 4 }],
    });
    expect(t.status).toBe(201);

    // Cannot receive before dispatch
    const early = await request(app).post(`/api/transfers/${t.body.data.id}/receive`).set(h)
      .send({ items: [{ variantId: c.accVariant.id, quantity: 4 }] });
    expect(early.status).toBe(422);

    await request(app).post(`/api/transfers/${t.body.data.id}/dispatch`).set(h);
    const srcBal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    expect(srcBal.onHand).toBe(6); // left the source
    const destBalBefore = await prisma.inventoryBalance.findFirst({
      where: { warehouseId: dest.id, variantId: c.accVariant.id },
    });
    expect(destBalBefore).toBeNull(); // in transit, not at destination yet

    // Partial receive 3 of 4
    const partial = await request(app).post(`/api/transfers/${t.body.data.id}/receive`).set(h)
      .send({ items: [{ variantId: c.accVariant.id, quantity: 3 }] });
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe('PARTIALLY_RECEIVED');

    // Over-receive rejected
    const over = await request(app).post(`/api/transfers/${t.body.data.id}/receive`).set(h)
      .send({ items: [{ variantId: c.accVariant.id, quantity: 2 }] });
    expect(over.status).toBe(422);

    // Cancel returns the outstanding 1 to the source
    const cancel = await request(app).post(`/api/transfers/${t.body.data.id}/cancel`).set(h);
    expect(cancel.status).toBe(200);
    const srcFinal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: c.warehouse.id, variantId: c.accVariant.id } },
    });
    const destFinal = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_variantId: { warehouseId: dest.id, variantId: c.accVariant.id } },
    });
    expect(srcFinal.onHand).toBe(7);
    expect(destFinal.onHand).toBe(3);
    expect(srcFinal.onHand + destFinal.onHand).toBe(10); // conservation of stock
  });

  it('transfers IMEI devices through IN_TRANSIT and blocks double-dispatch', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { phones: 1 });
    const dest = await secondWarehouse(accessToken, businessId);
    const device = c.devices[0];

    const t = await request(app).post('/api/transfers').set(h).send({
      fromWarehouseId: c.warehouse.id, toWarehouseId: dest.id, deviceIds: [device.id],
    });
    expect(t.status).toBe(201);
    await request(app).post(`/api/transfers/${t.body.data.id}/dispatch`).set(h);

    let d = await prisma.device.findUnique({ where: { id: device.id } });
    expect(d.status).toBe('IN_TRANSIT');

    // A second transfer with the same in-transit device must fail
    const t2 = await request(app).post('/api/transfers').set(h).send({
      fromWarehouseId: c.warehouse.id, toWarehouseId: dest.id, deviceIds: [device.id],
    });
    expect(t2.status).toBe(422);

    const r = await request(app).post(`/api/transfers/${t.body.data.id}/receive`).set(h)
      .send({ deviceIds: [device.id] });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('RECEIVED');

    d = await prisma.device.findUnique({ where: { id: device.id } });
    expect([d.status, d.warehouseId]).toEqual(['AVAILABLE', dest.id]);
  });
});

describe('shipments', () => {
  it('only ships fulfilled stock and tracks dispatch -> delivery', async () => {
    const { accessToken, businessId } = await registerOwner();
    const h = as(accessToken, businessId);
    const c = await seedStock(accessToken, businessId, { accessories: 10 });
    const customer = await createCustomer(accessToken, businessId);

    // Order of 6; fulfil only 4.
    const draft = await request(app).post('/api/orders').set(h).send({
      customerId: customer.id, warehouseId: c.warehouse.id,
      items: [{ variantId: c.accVariant.id, quantity: 6 }],
    });
    const orderId = draft.body.data.id;
    await request(app).post(`/api/orders/${orderId}/submit`).set(h);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(h);
    const line = (await request(app).get(`/api/orders/${orderId}`).set(h)).body.data.items[0];
    await request(app).post(`/api/orders/${orderId}/fulfil`).set(h).send({
      items: [{ orderItemId: line.id, quantity: 4 }],
    });

    // Trying to ship 5 (more than fulfilled) -> 422
    const tooMuch = await request(app).post('/api/shipments').set(h).send({
      salesOrderId: orderId, items: [{ orderItemId: line.id, quantity: 5 }],
    });
    expect(tooMuch.status).toBe(422);

    const shipment = await request(app).post('/api/shipments').set(h).send({
      salesOrderId: orderId, carrier: 'DHL', items: [{ orderItemId: line.id, quantity: 4 }],
    });
    expect(shipment.status).toBe(201);
    const sid = shipment.body.data.id;

    // Deliver before dispatch -> invalid
    const early = await request(app).post(`/api/shipments/${sid}/deliver`).set(h).send({});
    expect(early.status).toBe(422);

    await request(app).post(`/api/shipments/${sid}/dispatch`).set(h);
    const delivered = await request(app).post(`/api/shipments/${sid}/deliver`).set(h)
      .send({ podReference: 'POD-9988' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe('DELIVERED');
    expect(delivered.body.data.podReference).toBe('POD-9988');
  });
});
