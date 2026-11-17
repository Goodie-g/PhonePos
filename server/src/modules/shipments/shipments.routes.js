import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { nextDocNumber } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';

export const shipmentsRoutes = Router();
shipmentsRoutes.use(authenticate, resolveBusiness);

const shipmentInclude = {
  salesOrder: { select: { id: true, orderNumber: true, status: true, customer: { select: { id: true, name: true } } } },
  warehouse: { select: { id: true, name: true, code: true } },
  items: { include: { orderItem: { include: { variant: { include: { product: { select: { name: true, type: true } } } } } } } },
  devices: { include: { device: { select: { id: true, imei1: true, status: true } } } },
};

const createSchema = z.object({
  salesOrderId: z.string().uuid(),
  carrier: z.string().max(80).optional(),
  trackingRef: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
  })).default([]),
  deviceIds: z.array(z.string().uuid()).max(500).default([]),
}).refine((v) => v.items.length + v.deviceIds.length > 0, { message: 'Shipment needs items and/or devices' });

shipmentsRoutes.get('/', requirePermission('shipments:read'), ah(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
  const where = {
    businessId: req.businessId,
    ...(req.query.status && { status: req.query.status }),
    ...(req.query.salesOrderId && { salesOrderId: req.query.salesOrderId }),
  };
  const [total, data] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: shipmentInclude,
    }),
  ]);
  res.json({ data, page, pageSize, total });
}));

shipmentsRoutes.get('/:id', requirePermission('shipments:read'), ah(async (req, res) => {
  const data = await prisma.shipment.findFirst({
    where: { id: req.params.id, businessId: req.businessId }, include: shipmentInclude,
  });
  if (!data) throw ApiError.notFound('Shipment not found');
  res.json({ data });
}));

// Creates a PICKING shipment. Rule: a shipment can only contain stock that is
// already FULFILLED on the order (per line, across all non-cancelled shipments).
shipmentsRoutes.post('/', requirePermission('shipments:manage'),
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const data = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: req.body.salesOrderId, businessId: req.businessId },
        include: { items: true },
      });
      if (!order) throw ApiError.notFound('Sales order not found');
      if (!['PARTIALLY_FULFILLED', 'FULFILLED', 'INVOICED'].includes(order.status)) {
        throw ApiError.unprocessable('INVALID_STATE', `Cannot ship an order in status ${order.status} — fulfil it first`);
      }
      const itemsById = new Map(order.items.map((i) => [i.id, i]));

      // Already-shipped quantities per line (excluding cancelled shipments).
      const existing = await tx.shipmentItem.findMany({
        where: { orderItemId: { in: order.items.map((i) => i.id) }, shipment: { status: { not: 'CANCELLED' } } },
      });
      const shippedByLine = new Map();
      for (const e of existing) shippedByLine.set(e.orderItemId, (shippedByLine.get(e.orderItemId) ?? 0) + e.quantity);

      for (const line of req.body.items) {
        const item = itemsById.get(line.orderItemId);
        if (!item) throw ApiError.badRequest(`Item ${line.orderItemId} is not part of this order`);
        const shippable = item.fulfilledQty - (shippedByLine.get(item.id) ?? 0);
        if (line.quantity > shippable) {
          throw ApiError.unprocessable('OVER_SHIP', `Cannot ship ${line.quantity}; only ${shippable} fulfilled and unshipped on this line`);
        }
      }

      // Devices must be SOLD for this order and not already in an active shipment.
      for (const deviceId of req.body.deviceIds) {
        const device = await tx.device.findFirst({ where: { id: deviceId, businessId: req.businessId } });
        if (!device || device.status !== 'SOLD' || !device.soldOrderItemId) {
          throw ApiError.unprocessable('DEVICE_STATE', `Device ${device?.imei1 ?? deviceId} is not sold stock of this order`);
        }
        const orderItem = itemsById.get(device.soldOrderItemId);
        if (!orderItem) throw ApiError.badRequest(`Device ${device.imei1} belongs to a different order`);
        const already = await tx.shipmentDevice.findFirst({
          where: { deviceId, shipment: { status: { not: 'CANCELLED' } } },
        });
        if (already) throw ApiError.conflict(`Device ${device.imei1} is already assigned to another shipment`);
      }

      const shipmentNumber = await nextDocNumber(tx, req.businessId, 'shipment');
      const shipment = await tx.shipment.create({
        data: {
          businessId: req.businessId, salesOrderId: order.id, warehouseId: order.warehouseId,
          shipmentNumber, status: 'PICKING', carrier: req.body.carrier,
          trackingRef: req.body.trackingRef, note: req.body.note, createdById: req.user.id,
          items: { create: req.body.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
          devices: { create: req.body.deviceIds.map((deviceId) => ({ deviceId })) },
        },
        include: shipmentInclude,
      });
      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'shipment.create',
        entityType: 'Shipment', entityId: shipment.id, after: { shipmentNumber },
      });
      return shipment;
    });
    res.status(201).json({ data });
  }));

const transition = (fromStatuses, to, extra = {}) => async (req, res) => {
  const data = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!shipment) throw ApiError.notFound('Shipment not found');
    if (!fromStatuses.includes(shipment.status)) {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot mark ${to} a shipment in status ${shipment.status}`);
    }
    const updated = await tx.shipment.update({
      where: { id: shipment.id }, data: { status: to, ...extra(req) }, include: shipmentInclude,
    });
    await writeAudit(tx, {
      businessId: req.businessId, userId: req.user.id, action: `shipment.${to.toLowerCase()}`,
      entityType: 'Shipment', entityId: shipment.id, before: { status: shipment.status }, after: { status: to },
    });
    return updated;
  });
  res.json({ data });
};

shipmentsRoutes.post('/:id/dispatch', requirePermission('shipments:dispatch'),
  ah(transition(['PICKING'], 'DISPATCHED', () => ({ dispatchedAt: new Date() }))));

shipmentsRoutes.post('/:id/deliver', requirePermission('shipments:deliver'),
  validate({ body: z.object({ podReference: z.string().max(120).optional() }) }),
  ah(transition(['DISPATCHED'], 'DELIVERED', (req) => ({ deliveredAt: new Date(), podReference: req.body.podReference ?? null }))));

shipmentsRoutes.post('/:id/cancel', requirePermission('shipments:manage'),
  ah(transition(['PICKING'], 'CANCELLED')));
