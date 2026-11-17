/**
 * Stoku seed — fictional demo data.
 *
 * Everything goes through the same service functions the API uses, so seeded
 * stock respects every invariant (balances, ledger, reservations, IMEIs).
 *
 * Run: npm run seed   (from the server/ directory)
 *
 * Demo logins (password for ALL: Stoku2026!)
 *   neema@uhuruphones.co.tz   — owner of Uhuru Phones (2 warehouses, full data)
 *   baraka@kiligadgets.co.tz  — owner of Kili Gadgets (separate tenant, small data)
 *   sales@uhuruphones.co.tz   — sales manager at Uhuru Phones
 *   store@uhuruphones.co.tz   — warehouse staff at Uhuru Phones
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createPurchaseOrder, receiveGoods, transitionPO } from '../src/modules/purchases/purchases.service.js';
import { createOrder, submitOrder, confirmOrder, fulfilOrder } from '../src/modules/sales/sales.service.js';
import { createInvoice, recordPayment } from '../src/modules/invoicing/invoicing.service.js';
import { createTransfer, dispatchTransfer, receiveTransfer } from '../src/modules/transfers/transfers.service.js';

const prisma = new PrismaClient();
const PASSWORD = 'Stoku2026!';

const makeImei = (() => {
  let counter = 86000001;
  return () => {
    const base = `359123${String(counter++).padStart(8, '0')}`.slice(0, 14);
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let d = Number(base[i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return `${base}${(10 - (sum % 10)) % 10}`;
  };
})();

const main = async () => {
  const existing = await prisma.business.count();
  if (existing > 0) {
    console.log('Database already contains businesses — skipping seed (reset it first if you want a fresh seed).');
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ── Business 1: Uhuru Phones & Accessories ─────────────────────────
  const uhuru = await prisma.business.create({
    data: {
      name: 'Uhuru Phones & Accessories',
      currency: 'TZS',
      taxRatePercent: 18, // VAT in Tanzania
      warehouses: {
        create: [
          { name: 'Main Warehouse', code: 'MAIN', address: 'Kariakoo, Dar es Salaam' },
          { name: 'Arusha Branch', code: 'ARS', address: 'Sokoine Rd, Arusha' },
        ],
      },
      priceLists: { create: { name: 'Standard Wholesale', isDefault: true } },
    },
    include: { warehouses: true, priceLists: true },
  });
  const [mainWh, arsWh] = uhuru.warehouses;
  const priceList = uhuru.priceLists[0];

  const users = await Promise.all([
    prisma.user.create({ data: { email: 'neema@uhuruphones.co.tz', fullName: 'Neema Mushi', passwordHash } }),
    prisma.user.create({ data: { email: 'sales@uhuruphones.co.tz', fullName: 'Joseph Kimaro', passwordHash } }),
    prisma.user.create({ data: { email: 'store@uhuruphones.co.tz', fullName: 'Asha Juma', passwordHash } }),
  ]);
  const [owner, salesMgr, storeStaff] = users;
  await prisma.membership.createMany({
    data: [
      { userId: owner.id, businessId: uhuru.id, role: 'OWNER' },
      { userId: salesMgr.id, businessId: uhuru.id, role: 'SALES_MANAGER' },
      { userId: storeStaff.id, businessId: uhuru.id, role: 'WAREHOUSE_STAFF' },
    ],
  });

  // ── Business 2: Kili Gadgets (tenant-isolation demo) ───────────────
  const kili = await prisma.business.create({
    data: {
      name: 'Kili Gadgets',
      currency: 'TZS',
      warehouses: { create: { name: 'Main Warehouse', code: 'MAIN', address: 'Moshi, Kilimanjaro' } },
      priceLists: { create: { name: 'Standard Wholesale', isDefault: true } },
    },
    include: { warehouses: true },
  });
  const kiliOwner = await prisma.user.create({
    data: { email: 'baraka@kiligadgets.co.tz', fullName: 'Baraka Mwita', passwordHash },
  });
  await prisma.membership.create({ data: { userId: kiliOwner.id, businessId: kili.id, role: 'OWNER' } });

  // ── Catalogue (shared shapes, per-tenant rows) ─────────────────────
  const buildCatalogue = async (businessId) => {
    const brands = {};
    for (const name of ['Apple', 'Samsung', 'Xiaomi', 'Tecno', 'Anker', 'JBL']) {
      brands[name] = await prisma.brand.create({ data: { businessId, name } });
    }
    const catPhones = await prisma.category.create({ data: { businessId, name: 'Smartphones' } });
    const catAcc = await prisma.category.create({ data: { businessId, name: 'Accessories' } });

    const mk = async (brandId, categoryId, name, type, variants) => {
      const product = await prisma.product.create({
        data: { businessId, brandId, categoryId, name, type },
      });
      const created = [];
      for (const v of variants) {
        created.push(await prisma.productVariant.create({
          data: { businessId, productId: product.id, ...v },
        }));
      }
      return { product, variants: created };
    };

    return {
      brands, catPhones, catAcc,
      iphone15: await mk(brands.Apple.id, catPhones.id, 'iPhone 15', 'PHONE', [
        { sku: 'IP15-128-BLK', storageGb: 128, ramGb: 6, color: 'Black', costPrice: 1950000, sellPrice: 2350000 },
        { sku: 'IP15-256-BLU', storageGb: 256, ramGb: 6, color: 'Blue', costPrice: 2250000, sellPrice: 2690000 },
      ]),
      galaxyA15: await mk(brands.Samsung.id, catPhones.id, 'Galaxy A15', 'PHONE', [
        { sku: 'A15-128-BLK', storageGb: 128, ramGb: 4, color: 'Black', costPrice: 320000, sellPrice: 420000 },
        { sku: 'A15-256-YEL', storageGb: 256, ramGb: 8, color: 'Yellow', costPrice: 385000, sellPrice: 495000 },
      ]),
      redmiNote13: await mk(brands.Xiaomi.id, catPhones.id, 'Redmi Note 13', 'PHONE', [
        { sku: 'RN13-128-MNT', storageGb: 128, ramGb: 6, color: 'Mint', costPrice: 355000, sellPrice: 455000 },
      ]),
      tecnoSpark: await mk(brands.Tecno.id, catPhones.id, 'Tecno Spark 20', 'PHONE', [
        { sku: 'TS20-128-GRN', storageGb: 128, ramGb: 4, color: 'Gravity Green', costPrice: 240000, sellPrice: 320000 },
      ]),
      charger: await mk(brands.Anker.id, catAcc.id, 'Anker 20W USB-C Charger', 'ACCESSORY', [
        { sku: 'ANK-CHG-20W', costPrice: 18000, sellPrice: 35000 },
      ]),
      cable: await mk(brands.Anker.id, catAcc.id, 'USB-C to USB-C Cable 1m', 'ACCESSORY', [
        { sku: 'ANK-CBL-1M', costPrice: 5000, sellPrice: 12000 },
      ]),
      earbuds: await mk(brands.JBL.id, catAcc.id, 'JBL Tune Flex Earbuds', 'ACCESSORY', [
        { sku: 'JBL-TFLEX-BLK', costPrice: 85000, sellPrice: 135000 },
      ]),
      case_: await mk(brands.Samsung.id, catAcc.id, 'Galaxy A15 Silicone Case', 'ACCESSORY', [
        { sku: 'A15-CASE-CLR', costPrice: 4000, sellPrice: 10000 },
      ]),
    };
  };

  const cat = await buildCatalogue(uhuru.id);
  const kiliCat = await buildCatalogue(kili.id);

  // ── Wholesale quantity tiers (Uhuru default price list) ────────────
  await prisma.priceListItem.createMany({
    data: [
      { priceListId: priceList.id, variantId: cat.galaxyA15.variants[0].id, minQty: 10, unitPrice: 398000 },
      { priceListId: priceList.id, variantId: cat.cable.variants[0].id, minQty: 20, unitPrice: 9800 },
      { priceListId: priceList.id, variantId: cat.charger.variants[0].id, minQty: 10, unitPrice: 31500 },
      { priceListId: priceList.id, variantId: cat.tecnoSpark.variants[0].id, minQty: 15, unitPrice: 305000 },
    ],
  });

  // ── Suppliers ──────────────────────────────────────────────────────
  const supplierA = await prisma.supplier.create({
    data: { businessId: uhuru.id, name: 'Shenzhen Imports Ltd', phone: '+86 755 555 0101', email: 'sales@shenzhenimports.example', address: 'Huaqiangbei, Shenzhen' },
  });
  const supplierB = await prisma.supplier.create({
    data: { businessId: uhuru.id, name: 'Dubai Mobile Trading', phone: '+971 4 555 0102', email: 'orders@dubaimobile.example', address: 'Deira, Dubai' },
  });
  await prisma.supplier.create({
    data: { businessId: kili.id, name: 'Nairobi Gadget Supply', phone: '+254 20 555 0103' },
  });

  // ── Customers ──────────────────────────────────────────────────────
  const mkCustomer = (businessId, data) => prisma.customer.create({
    data: { businessId, code: `CUST-${String(Math.floor(Math.random() * 900) + 100)}`, ...data },
  });
  const customers = await Promise.all([
    mkCustomer(uhuru.id, { code: 'CUST-001', name: 'Mwanza Retail Ltd', contactName: 'Grace Paulo', phone: '+255 754 111 222', creditLimit: 15000000, paymentTermsDays: 30 }),
    mkCustomer(uhuru.id, { code: 'CUST-002', name: 'Arusha Gadgets', contactName: 'David Lyimo', phone: '+255 763 333 444', creditLimit: 5000000, paymentTermsDays: 14 }),
    mkCustomer(uhuru.id, { code: 'CUST-003', name: 'Dar Phone Hub', contactName: 'Zawadi Said', phone: '+255 715 555 666', creditLimit: 0, paymentTermsDays: 0 }),
  ]);
  const [mwanzaRetail] = customers;
  await mkCustomer(kili.id, { code: 'CUST-001', name: 'Moshi Mobile Point', phone: '+255 742 777 888', creditLimit: 3000000, paymentTermsDays: 14 });

  // ── Purchasing: receive phones (IMEIs) + accessories into MAIN ─────
  const ctx = { businessId: uhuru.id, userId: owner.id };
  const buyAndReceive = async (supplierId, warehouseId, lines) => {
    const po = await createPurchaseOrder({
      ...ctx,
      body: {
        supplierId,
        items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitCost: l.cost })),
      },
    });
    await transitionPO({ ...ctx, id: po.id, action: 'submit' });
    const items = [];
    const devices = [];
    for (const line of lines) {
      const poItem = po.items.find((i) => i.variantId === line.variant.id);
      if (line.phones) {
        for (let n = 0; n < line.quantity; n++) {
          devices.push({ purchaseOrderItemId: poItem.id, imei1: makeImei(), warrantyMonths: 12 });
        }
      } else {
        items.push({ purchaseOrderItemId: poItem.id, quantity: line.quantity });
      }
    }
    return receiveGoods({ ...ctx, id: po.id, body: { warehouseId, items, devices } });
  };

  await buyAndReceive(supplierA.id, mainWh.id, [
    { variant: cat.galaxyA15.variants[0], quantity: 12, cost: 320000, phones: true },
    { variant: cat.galaxyA15.variants[1], quantity: 6, cost: 385000, phones: true },
    { variant: cat.tecnoSpark.variants[0], quantity: 20, cost: 240000, phones: true },
    { variant: cat.cable.variants[0], quantity: 100, cost: 5000 },
    { variant: cat.case_.variants[0], quantity: 60, cost: 4000 },
  ]);
  await buyAndReceive(supplierB.id, mainWh.id, [
    { variant: cat.iphone15.variants[0], quantity: 4, cost: 1950000, phones: true },
    { variant: cat.iphone15.variants[1], quantity: 2, cost: 2250000, phones: true },
    { variant: cat.redmiNote13.variants[0], quantity: 8, cost: 355000, phones: true },
    { variant: cat.charger.variants[0], quantity: 40, cost: 18000 },
    { variant: cat.earbuds.variants[0], quantity: 15, cost: 85000 },
  ]);

  // Post-receiving check: everything becomes AVAILABLE.
  await prisma.device.updateMany({
    where: { businessId: uhuru.id, status: 'RECEIVED' },
    data: { status: 'AVAILABLE' },
  });

  // ── Sale 1: full lifecycle (invoiced, partially paid) ──────────────
  const order1 = await createOrder({
    ...ctx, userId: salesMgr.id,
    body: {
      customerId: mwanzaRetail.id, warehouseId: mainWh.id,
      notes: 'Monthly restock for Mwanza Retail',
      items: [
        { variantId: cat.galaxyA15.variants[0].id, quantity: 5 },
        { variantId: cat.tecnoSpark.variants[0].id, quantity: 4 },
        { variantId: cat.cable.variants[0].id, quantity: 25 },
      ],
    },
  });
  await submitOrder({ ...ctx, id: order1.id });
  await confirmOrder({ ...ctx, id: order1.id });
  const reservedForOrder1 = await prisma.device.findMany({
    where: { businessId: uhuru.id, status: 'RESERVED', reservedOrderItemId: { in: order1.items.map((i) => i.id) } },
  });
  const phoneLines = order1.items.filter((i) =>
    [cat.galaxyA15.variants[0].id, cat.tecnoSpark.variants[0].id].includes(i.variantId));
  const cableLine = order1.items.find((i) => i.variantId === cat.cable.variants[0].id);
  await fulfilOrder({
    ...ctx, id: order1.id,
    body: {
      items: [
        ...phoneLines.map((line) => ({
          orderItemId: line.id,
          deviceIds: reservedForOrder1.filter((d) => d.reservedOrderItemId === line.id).map((d) => d.id),
        })),
        { orderItemId: cableLine.id, quantity: 25 },
      ],
    },
  });
  const invoice1 = await createInvoice({ ...ctx, salesOrderId: order1.id });
  await recordPayment({
    ...ctx, invoiceId: invoice1.id,
    body: { amount: 1500000, method: 'MOBILE_MONEY', reference: 'MM-DEMO-0001' },
  });
  await recordPayment({
    ...ctx, invoiceId: invoice1.id,
    body: { amount: 500000, method: 'BANK_TRANSFER', reference: 'NMB-DEMO-0042' },
  });

  // ── Sale 2: confirmed (stock reserved, awaiting fulfilment) ────────
  const order2 = await createOrder({
    ...ctx, userId: salesMgr.id,
    body: {
      customerId: customers[1].id, warehouseId: mainWh.id,
      items: [
        { variantId: cat.iphone15.variants[0].id, quantity: 1 },
        { variantId: cat.charger.variants[0].id, quantity: 10 },
      ],
    },
  });
  await submitOrder({ ...ctx, id: order2.id });
  await confirmOrder({ ...ctx, id: order2.id });

  // ── Sale 3: draft ──────────────────────────────────────────────────
  await createOrder({
    ...ctx, userId: salesMgr.id,
    body: {
      customerId: customers[2].id, warehouseId: mainWh.id,
      items: [{ variantId: cat.earbuds.variants[0].id, quantity: 3 }],
    },
  });

  // ── Transfer: send stock to Arusha (partially received) ────────────
  const arsDevices = await prisma.device.findMany({
    where: { businessId: uhuru.id, status: 'AVAILABLE', warehouseId: mainWh.id, variantId: cat.tecnoSpark.variants[0].id },
    take: 4, select: { id: true },
  });
  const transfer = await createTransfer({
    ...ctx, userId: storeStaff.id,
    body: {
      fromWarehouseId: mainWh.id, toWarehouseId: arsWh.id,
      note: 'Stock for Arusha branch launch',
      items: [{ variantId: cat.cable.variants[0].id, quantity: 20 }],
      deviceIds: arsDevices.map((d) => d.id),
    },
  });
  await dispatchTransfer({ ...ctx, id: transfer.id });
  const refreshedTransfer = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: transfer.id }, include: { devices: true, items: true },
  });
  await receiveTransfer({
    ...ctx, id: transfer.id,
    body: {
      items: [{ variantId: cat.cable.variants[0].id, quantity: 20 }],
      deviceIds: refreshedTransfer.devices.slice(0, 2).map((d) => d.deviceId), // 2 still in transit
    },
  });

  // ── Kili Gadgets: a small stock position (proves tenant isolation) ─
  const kiliCtx = { businessId: kili.id, userId: kiliOwner.id };
  const kiliPo = await createPurchaseOrder({
    ...kiliCtx,
    body: {
      supplierId: (await prisma.supplier.findFirstOrThrow({ where: { businessId: kili.id } })).id,
      items: [{ variantId: kiliCat.galaxyA15.variants[0].id, quantity: 5, unitCost: 325000 }],
    },
  });
  await transitionPO({ ...kiliCtx, id: kiliPo.id, action: 'submit' });
  await receiveGoods({
    ...kiliCtx, id: kiliPo.id,
    body: {
      warehouseId: kili.warehouses[0].id, items: [],
      devices: Array.from({ length: 5 }, () => ({
        purchaseOrderItemId: kiliPo.items[0].id, imei1: makeImei(),
      })),
    },
  });
  await prisma.device.updateMany({
    where: { businessId: kili.id, status: 'RECEIVED' }, data: { status: 'AVAILABLE' },
  });

  const [deviceCount, movementCount, orderCount] = await Promise.all([
    prisma.device.count(), prisma.stockMovement.count(), prisma.salesOrder.count(),
  ]);
  console.log('Seed complete:');
  console.log(`  Businesses : 2 (Uhuru Phones & Accessories, Kili Gadgets)`);
  console.log(`  Devices    : ${deviceCount} IMEI-tracked phones`);
  console.log(`  Movements  : ${movementCount} stock-ledger entries`);
  console.log(`  Orders     : ${orderCount} (invoiced+partially paid, confirmed, draft)`);
  console.log(`  Login      : neema@uhuruphones.co.tz / ${PASSWORD}`);
};

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
