import request from 'supertest';
import { app, as } from './helpers.js';

/** Builds a valid Luhn IMEI from 14 digits (matches server-side validation). */
export const makeImei = (first14) => {
  const base = first14.padEnd(14, '0').slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(base[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
};

/** Creates catalogue (phone + accessory) + supplier; returns ids incl. main warehouse. */
export const seedCatalogue = async (token, businessId) => {
  const h = as(token, businessId);
  const brand = (await request(app).post('/api/products/brands').set(h).send({ name: 'Samsung' })).body.data;
  const category = (await request(app).post('/api/products/categories').set(h).send({ name: 'Smartphones' })).body.data;
  const phone = (await request(app).post('/api/products').set(h).send({
    brandId: brand.id, categoryId: category.id, name: 'Galaxy A15', type: 'PHONE',
  })).body.data;
  const phoneVariant = (await request(app).post(`/api/products/${phone.id}/variants`).set(h).send({
    sku: 'A15-128-BLK', storageGb: 128, ramGb: 4, color: 'Black', costPrice: 320000, sellPrice: 420000,
  })).body.data;
  const accessory = (await request(app).post('/api/products').set(h).send({
    brandId: brand.id, name: 'USB-C Cable 1m', type: 'ACCESSORY',
  })).body.data;
  const accVariant = (await request(app).post(`/api/products/${accessory.id}/variants`).set(h).send({
    sku: 'CABLE-USBC-1M', costPrice: 3000, sellPrice: 8000,
  })).body.data;
  const supplier = (await request(app).post('/api/suppliers').set(h).send({ name: 'Shenzhen Imports' })).body.data;
  const warehouse = (await request(app).get('/api/warehouses').set(h)).body.data[0];
  return { brand, category, phone, phoneVariant, accessory, accVariant, supplier, warehouse };
};

export const createAndSubmitPO = async (token, businessId, supplierId, items) => {
  const h = as(token, businessId);
  const po = (await request(app).post('/api/purchases').set(h).send({ supplierId, items })).body.data;
  await request(app).post(`/api/purchases/${po.id}/submit`).set(h);
  return (await request(app).get(`/api/purchases/${po.id}`).set(h)).body.data;
};

/** Receive accessories and return nothing (asserts 201). */
export const receiveAccessories = async (token, businessId, poId, warehouseId, purchaseOrderItemId, quantity) => {
  const res = await request(app).post(`/api/purchases/${poId}/receive`)
    .set(as(token, businessId))
    .send({ warehouseId, items: [{ purchaseOrderItemId, quantity }] });
  if (res.status !== 201) throw new Error(`receiveAccessories failed: ${JSON.stringify(res.body)}`);
};

/** Receive phones; returns the created Device rows (fetched from the API). */
export const receiveDevices = async (token, businessId, poId, warehouseId, purchaseOrderItemId, imeis) => {
  const res = await request(app).post(`/api/purchases/${poId}/receive`)
    .set(as(token, businessId))
    .send({ warehouseId, devices: imeis.map((imei1) => ({ purchaseOrderItemId, imei1 })) });
  if (res.status !== 201) throw new Error(`receiveDevices failed: ${JSON.stringify(res.body)}`);
  const list = await request(app)
    .get(`/api/devices?variantId=${res.body.data.items.find((i) => i.id === purchaseOrderItemId).variantId}`)
    .set(as(token, businessId));
  return list.body.data;
};

/** Mark every RECEIVED device AVAILABLE (post-receiving check). */
export const markAvailable = async (token, businessId, devices) => {
  for (const d of devices) {
    if (d.status === 'AVAILABLE') continue;
    const res = await request(app).post(`/api/devices/${d.id}/mark-available`).set(as(token, businessId));
    if (res.status !== 200) throw new Error(`markAvailable failed: ${JSON.stringify(res.body)}`);
  }
  return devices.map((d) => ({ ...d, status: 'AVAILABLE' }));
};

/** Full stock setup: 1 phone (with IMEIs) + accessories, all AVAILABLE. */
export const seedStock = async (token, businessId, { phones = 0, accessories = 0 } = {}) => {
  const c = await seedCatalogue(token, businessId);
  let devices = [];
  if (phones > 0) {
    const po = await createAndSubmitPO(token, businessId, c.supplier.id, [
      { variantId: c.phoneVariant.id, quantity: phones, unitCost: 320000 },
    ]);
    const imeis = Array.from({ length: phones }, (_, i) => makeImei(`35912345${String(i + 1).padStart(6, '0')}`));
    devices = await receiveDevices(token, businessId, po.id, c.warehouse.id, po.items[0].id, imeis);
    devices = await markAvailable(token, businessId, devices);
  }
  if (accessories > 0) {
    const po = await createAndSubmitPO(token, businessId, c.supplier.id, [
      { variantId: c.accVariant.id, quantity: accessories, unitCost: 3000 },
    ]);
    await receiveAccessories(token, businessId, po.id, c.warehouse.id, po.items[0].id, accessories);
  }
  return { ...c, devices };
};

export const createCustomer = async (token, businessId, overrides = {}) => {
  const res = await request(app).post('/api/customers').set(as(token, businessId)).send({
    name: overrides.name ?? 'Mwanza Retail Ltd',
    creditLimit: overrides.creditLimit ?? 0,
    paymentTermsDays: overrides.paymentTermsDays ?? 0,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createCustomer failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
