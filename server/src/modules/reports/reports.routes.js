import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';

export const reportsRoutes = Router();
reportsRoutes.use(authenticate, resolveBusiness, requirePermission('reports:read'));

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  warehouseId: z.string().uuid().optional(),
});
const rangeWhere = (businessId, { from, to }, field = 'createdAt') => ({
  businessId,
  ...(from || to ? { [field]: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
});

/**
 * Dashboard: headline numbers for a date range (defaults to all time).
 * Definitions (see docs/LEARNING_GUIDE.md):
 *  - revenue       = sum of non-void invoice totals issued in range (incl. tax)
 *  - cashCollected = sum of payments recorded in range
 *  - cogsEstimate  = acquisition cost of goods on those invoices
 *                    (phones: device.acquisitionCost; accessories: variant.costPrice)
 *  - grossProfit   = (revenue - taxTotal) - cogsEstimate  [an ESTIMATE]
 *  - stockValue    = current replacement value of sellable stock
 */
reportsRoutes.get('/dashboard', validate({ query: rangeQuery }), ah(async (req, res) => {
  const businessId = req.businessId;
  const invWhere = { ...rangeWhere(businessId, req.query, 'issuedAt'), status: { not: 'VOID' } };

  const [invoiceAgg, paymentAgg, invoicedOrders, openOrders, customerDebtors] = await Promise.all([
    prisma.invoice.aggregate({
      where: invWhere,
      _sum: { total: true, taxTotal: true, subtotal: true }, _count: true,
    }),
    prisma.payment.aggregate({
      where: rangeWhere(businessId, req.query, 'receivedAt'),
      _sum: { amount: true }, _count: true,
    }),
    prisma.invoice.findMany({
      where: invWhere,
      select: {
        salesOrder: {
          select: {
            items: {
              select: {
                quantity: true,
                variant: { select: { id: true, costPrice: true, product: { select: { type: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.salesOrder.groupBy({
      by: ['status'],
      where: { businessId, status: { in: ['SUBMITTED', 'CONFIRMED', 'PARTIALLY_FULFILLED'] } },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['customerId'],
      where: { businessId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      _sum: { total: true, amountPaid: true },
    }),
  ]);

  // COGS estimate from the orders behind the invoiced sales.
  let cogsEstimate = new Prisma.Decimal(0);
  const phoneVariantIds = new Set();
  let phoneUnits = 0;
  for (const inv of invoicedOrders) {
    for (const item of inv.salesOrder.items) {
      if (item.variant.product.type === 'ACCESSORY') {
        cogsEstimate = cogsEstimate.plus(new Prisma.Decimal(item.variant.costPrice).times(item.quantity));
      } else {
        phoneUnits += item.quantity;
        phoneVariantIds.add(item.variant.id);
      }
    }
  }
  if (phoneUnits > 0) {
    const soldDevices = await prisma.device.aggregate({
      where: { businessId, status: 'SOLD', variantId: { in: [...phoneVariantIds] } },
      _sum: { acquisitionCost: true },
    });
    cogsEstimate = cogsEstimate.plus(soldDevices._sum.acquisitionCost ?? 0);
  }

  const revenue = invoiceAgg._sum.total ?? new Prisma.Decimal(0);
  const tax = invoiceAgg._sum.taxTotal ?? new Prisma.Decimal(0);
  const grossProfit = new Prisma.Decimal(revenue).minus(tax).minus(cogsEstimate);
  const totalOutstanding = customerDebtors.reduce(
    (s, g) => s.plus(new Prisma.Decimal(g._sum.total ?? 0).minus(g._sum.amountPaid ?? 0)),
    new Prisma.Decimal(0)
  );

  res.json({
    data: {
      range: { from: req.query.from ?? null, to: req.query.to ?? null },
      revenue,
      cashCollected: paymentAgg._sum.amount ?? 0,
      paymentsCount: paymentAgg._count,
      invoicesIssued: invoiceAgg._count,
      cogsEstimate,
      grossProfit,
      totalOutstanding,
      debtorCount: customerDebtors.length,
      openOrders: Object.fromEntries(openOrders.map((o) => [o.status, o._count._all])),
    },
  });
}));

// Stock position + estimated value per warehouse.
reportsRoutes.get('/stock', validate({ query: rangeQuery }), ah(async (req, res) => {
  const businessId = req.businessId;
  const balances = await prisma.inventoryBalance.findMany({
    where: { businessId, ...(req.query.warehouseId && { warehouseId: req.query.warehouseId }) },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      variant: { select: { id: true, sku: true, costPrice: true, sellPrice: true, lowStockThreshold: true, product: { select: { name: true, type: true, brand: { select: { name: true } } } } } },
    },
    orderBy: [{ warehouseId: 'asc' }],
  });
  const data = balances.map((b) => {
    const available = b.onHand - b.reserved;
    return {
      ...b,
      available,
      isLow: available <= b.variant.lowStockThreshold,
      costValue: new Prisma.Decimal(b.variant.costPrice).times(b.onHand),
    };
  });
  const totalCostValue = data.reduce((s, d) => s.plus(d.costValue), new Prisma.Decimal(0));
  res.json({ data, summary: { totalCostValue, lowStockCount: data.filter((d) => d.isLow).length } });
}));

// Outstanding balances per customer, with overdue split.
reportsRoutes.get('/outstanding', ah(async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { businessId: req.businessId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    include: { customer: { select: { id: true, code: true, name: true, creditLimit: true } } },
  });
  const byCustomer = new Map();
  const now = new Date();
  for (const inv of invoices) {
    const outstanding = new Prisma.Decimal(inv.total).minus(inv.amountPaid);
    if (outstanding.lte(0)) continue;
    const entry = byCustomer.get(inv.customerId) ?? {
      customer: inv.customer, outstanding: new Prisma.Decimal(0), overdue: new Prisma.Decimal(0), invoices: 0,
    };
    entry.outstanding = entry.outstanding.plus(outstanding);
    if (inv.dueAt && inv.dueAt < now) entry.overdue = entry.overdue.plus(outstanding);
    entry.invoices += 1;
    byCustomer.set(inv.customerId, entry);
  }
  res.json({ data: [...byCustomer.values()].sort((a, b) => b.outstanding.comparedTo(a.outstanding)) });
}));

// Best sellers by fulfilled quantity in range.
reportsRoutes.get('/best-sellers', validate({ query: rangeQuery }), ah(async (req, res) => {
  const rows = await prisma.salesOrderItem.groupBy({
    by: ['variantId'],
    where: {
      salesOrder: {
        ...rangeWhere(req.businessId, req.query),
        status: { in: ['PARTIALLY_FULFILLED', 'FULFILLED', 'INVOICED'] },
      },
    },
    _sum: { fulfilledQty: true, lineTotal: true },
    orderBy: { _sum: { fulfilledQty: 'desc' } },
    take: 10,
  });
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: rows.map((r) => r.variantId) } },
    include: { product: { include: { brand: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  res.json({
    data: rows.map((r) => ({
      variant: byId.get(r.variantId),
      unitsSold: r._sum.fulfilledQty ?? 0,
      revenue: r._sum.lineTotal ?? 0,
    })),
  });
}));
