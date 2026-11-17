import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { nextDocNumber, dec } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';
import { adjustOnHand } from '../../services/stock.js';

export const returnsRoutes = Router();
returnsRoutes.use(authenticate, resolveBusiness);

const returnInclude = {
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, orderNumber: true, warehouseId: true } },
  items: {
    include: {
      orderItem: { include: { variant: { include: { product: { select: { name: true, type: true } } } } } },
      device: { select: { id: true, imei1: true, status: true } },
    },
  },
};

const createSchema = z.object({
  salesOrderId: z.string().uuid(),
  reason: z.string().min(3).max(500),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(1).default(1),
    deviceId: z.string().uuid().optional(),
  })).min(1),
});

returnsRoutes.get('/', requirePermission('returns:read'), ah(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
  const where = { businessId: req.businessId, ...(req.query.status && { status: req.query.status }) };
  const [total, data] = await Promise.all([
    prisma.salesReturn.count({ where }),
    prisma.salesReturn.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: returnInclude,
    }),
  ]);
  res.json({ data, page, pageSize, total });
}));

returnsRoutes.get('/:id', requirePermission('returns:read'), ah(async (req, res) => {
  const data = await prisma.salesReturn.findFirst({
    where: { id: req.params.id, businessId: req.businessId }, include: returnInclude,
  });
  if (!data) throw ApiError.notFound('Return not found');
  res.json({ data });
}));

/**
 * Register a customer return. Returned goods go into a HOLDING state:
 * phones become RETURNED (not resellable); accessories are not restocked yet.
 * Nothing here makes anything sellable — that only happens after inspection.
 */
returnsRoutes.post('/', requirePermission('returns:manage'),
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const data = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: req.body.salesOrderId, businessId: req.businessId },
        include: { items: { include: { variant: { include: { product: true } } } } },
      });
      if (!order) throw ApiError.notFound('Sales order not found');
      if (!['PARTIALLY_FULFILLED', 'FULFILLED', 'INVOICED'].includes(order.status)) {
        throw ApiError.unprocessable('INVALID_STATE', `Cannot return against an order in status ${order.status}`);
      }
      const itemsById = new Map(order.items.map((i) => [i.id, i]));

      // Already-returned quantities per line (non-rejected returns).
      const previous = await tx.salesReturnItem.findMany({
        where: { orderItemId: { in: order.items.map((i) => i.id) }, salesReturn: { status: { not: 'REJECTED' } } },
      });
      const returnedByLine = new Map();
      for (const p of previous) returnedByLine.set(p.orderItemId, (returnedByLine.get(p.orderItemId) ?? 0) + p.quantity);

      const returnNumber = await nextDocNumber(tx, req.businessId, 'return');
      const salesReturn = await tx.salesReturn.create({
        data: {
          businessId: req.businessId, salesOrderId: order.id, customerId: order.customerId,
          returnNumber, reason: req.body.reason, createdById: req.user.id, status: 'RECEIVED',
        },
      });

      for (const line of req.body.items) {
        const item = itemsById.get(line.orderItemId);
        if (!item) throw ApiError.badRequest(`Item ${line.orderItemId} is not part of this order`);
        const returnable = item.fulfilledQty - (returnedByLine.get(item.id) ?? 0);
        if (line.quantity > returnable) {
          throw ApiError.unprocessable('OVER_RETURN', `Cannot return ${line.quantity}; only ${returnable} returnable on this line`);
        }

        let deviceId = null;
        if (item.variant.product.type === 'PHONE') {
          if (line.quantity !== 1 || !line.deviceId) {
            throw ApiError.badRequest('Phone returns must identify exactly one deviceId per line');
          }
          const device = await tx.device.findFirst({ where: { id: line.deviceId, businessId: req.businessId } });
          if (!device || device.status !== 'SOLD' || device.soldOrderItemId !== item.id) {
            throw ApiError.unprocessable('DEVICE_STATE', `Device ${device?.imei1 ?? line.deviceId} was not sold on this order line`);
          }
          await tx.device.update({
            where: { id: device.id },
            data: { status: 'RETURNED', warehouseId: order.warehouseId },
          });
          deviceId = device.id;
        }
        await tx.salesReturnItem.create({
          data: { salesReturnId: salesReturn.id, orderItemId: item.id, quantity: line.quantity, deviceId },
        });
      }

      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'return.create',
        entityType: 'SalesReturn', entityId: salesReturn.id, after: { returnNumber, lines: req.body.items.length },
      });
      return tx.salesReturn.findUniqueOrThrow({ where: { id: salesReturn.id }, include: returnInclude });
    });
    res.status(201).json({ data });
  }));

const inspectSchema = z.object({
  items: z.array(z.object({
    returnItemId: z.string().uuid(),
    outcome: z.enum(['RESTOCK', 'QUARANTINE']),
  })).min(1),
});

/**
 * Inspection decides each item's fate. Only RESTOCK makes goods sellable again
 * (balance + RETURN movement; phone AVAILABLE). QUARANTINE holds stock out of
 * circulation (phone QUARANTINED; accessories simply never restocked).
 */
returnsRoutes.post('/:id/inspect', requirePermission('returns:inspect'),
  validate({ body: inspectSchema }),
  ah(async (req, res) => {
    const data = await prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.findFirst({
        where: { id: req.params.id, businessId: req.businessId },
        include: { items: { include: { orderItem: true, device: true } }, salesOrder: true },
      });
      if (!salesReturn) throw ApiError.notFound('Return not found');
      if (!['RECEIVED', 'UNDER_INSPECTION'].includes(salesReturn.status)) {
        throw ApiError.unprocessable('INVALID_STATE', `Cannot inspect a return in status ${salesReturn.status}`);
      }
      const itemsById = new Map(salesReturn.items.map((i) => [i.id, i]));
      const warehouseId = salesReturn.salesOrder.warehouseId;

      for (const line of req.body.items) {
        const item = itemsById.get(line.returnItemId);
        if (!item) throw ApiError.badRequest(`Return item ${line.returnItemId} not found on this return`);
        if (item.inspectionOutcome !== 'PENDING') {
          throw ApiError.unprocessable('INVALID_STATE', 'Item was already inspected');
        }
        const variantId = item.orderItem.variantId;

        if (line.outcome === 'RESTOCK') {
          if (item.deviceId) {
            const claimed = await tx.device.updateMany({
              where: { id: item.deviceId, businessId: req.businessId, status: 'RETURNED' },
              data: { status: 'AVAILABLE' },
            });
            if (claimed.count === 0) throw ApiError.unprocessable('DEVICE_STATE', 'Device is not in RETURNED state');
          }
          await adjustOnHand(tx, {
            businessId: req.businessId, warehouseId, variantId,
            delta: item.quantity, type: 'RETURN', deviceId: item.deviceId,
            refType: 'SalesReturn', refId: salesReturn.id, userId: req.user.id,
          });
        } else if (item.deviceId) {
          // QUARANTINE for a phone
          const claimed = await tx.device.updateMany({
            where: { id: item.deviceId, businessId: req.businessId, status: 'RETURNED' },
            data: { status: 'QUARANTINED' },
          });
          if (claimed.count === 0) throw ApiError.unprocessable('DEVICE_STATE', 'Device is not in RETURNED state');
          await tx.stockMovement.create({
            data: {
              businessId: req.businessId, warehouseId, variantId, deviceId: item.deviceId,
              type: 'RETURN_OUT', quantity: 0, refType: 'SalesReturn', refId: salesReturn.id,
              note: 'Quarantined after inspection', createdById: req.user.id,
            },
          });
        }

        await tx.salesReturnItem.update({
          where: { id: item.id }, data: { inspectionOutcome: line.outcome },
        });
      }

      const refreshed = await tx.salesReturn.findUniqueOrThrow({ where: { id: salesReturn.id }, include: { items: true } });
      const allDone = refreshed.items.every((i) => i.inspectionOutcome !== 'PENDING');
      const updated = await tx.salesReturn.update({
        where: { id: salesReturn.id },
        data: { status: allDone ? 'CLOSED' : 'UNDER_INSPECTION' },
        include: returnInclude,
      });
      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'return.inspect',
        entityType: 'SalesReturn', entityId: salesReturn.id, after: { status: updated.status },
      });
      return updated;
    });
    res.json({ data });
  }));

// Record a refund amount against a return (bookkeeping record + audit).
returnsRoutes.post('/:id/refund', requirePermission('returns:manage'),
  validate({ body: z.object({ amount: z.coerce.number().positive() }) }),
  ah(async (req, res) => {
    const data = await prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
      if (!salesReturn) throw ApiError.notFound('Return not found');
      if (salesReturn.refundAmount) throw ApiError.conflict('A refund was already recorded for this return');
      if (['REJECTED'].includes(salesReturn.status)) {
        throw ApiError.unprocessable('INVALID_STATE', 'Cannot refund a rejected return');
      }
      const updated = await tx.salesReturn.update({
        where: { id: salesReturn.id }, data: { refundAmount: dec(req.body.amount) }, include: returnInclude,
      });
      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'return.refund',
        entityType: 'SalesReturn', entityId: salesReturn.id, after: { amount: req.body.amount },
      });
      return updated;
    });
    res.json({ data });
  }));
