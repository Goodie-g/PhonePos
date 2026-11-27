import { Prisma } from '@prisma/client';
import { prisma, withTransaction } from '../../db.js';
import { ApiError } from '../../utils/api-error.js';
import { nextDocNumber } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';
import { adjustOnHand } from '../../services/stock.js';

const poInclude = {
  supplier: true,
  items: { include: { variant: { include: { product: { include: { brand: true } } } } } },
  receipts: { include: { items: true }, orderBy: { createdAt: 'desc' } },
};

const getPOOrThrow = async (db, businessId, id) => {
  const po = await db.purchaseOrder.findFirst({
    where: { id, businessId },
    include: poInclude,
  });
  if (!po) throw ApiError.notFound('Purchase order not found');
  return po;
};

export const createPurchaseOrder = async ({ businessId, userId, body }) => {
  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, businessId, isActive: true },
  });
  if (!supplier) throw ApiError.badRequest('Unknown or inactive supplier');

  // Every variant must belong to this business (prevents cross-tenant orders).
  const variantIds = body.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, businessId },
    include: { product: true },
  });
  if (variants.length !== new Set(variantIds).size) {
    throw ApiError.badRequest('One or more variants do not belong to this business');
  }

  return withTransaction(async (tx) => {
    const poNumber = await nextDocNumber(tx, businessId, 'purchaseOrder');
    const po = await tx.purchaseOrder.create({
      data: {
        businessId,
        supplierId: supplier.id,
        poNumber,
        expectedAt: body.expectedAt,
        notes: body.notes,
        createdById: userId,
        status: 'DRAFT',
        items: {
          create: body.items.map((i) => ({
            variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost,
          })),
        },
      },
      include: poInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'purchase.create',
      entityType: 'PurchaseOrder', entityId: po.id, after: { poNumber },
    });
    return po;
  });
};

const ALLOWED_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['CANCELLED'], // received states are set by receive()
  PARTIALLY_RECEIVED: [],
  RECEIVED: [],
  CANCELLED: [],
};

export const transitionPO = async ({ businessId, userId, id, action }) => {
  return withTransaction(async (tx) => {
    const po = await getPOOrThrow(tx, businessId, id);
    const next = action === 'submit' ? 'SUBMITTED' : 'CANCELLED';
    if (!ALLOWED_TRANSITIONS[po.status].includes(next)) {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot ${action} a purchase order in status ${po.status}`);
    }
    if (next === 'CANCELLED' && po.items.some((i) => i.receivedQty > 0)) {
      throw ApiError.unprocessable('INVALID_TRANSITION', 'Cannot cancel: goods have already been received');
    }
    const updated = await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: next }, include: poInclude });
    await writeAudit(tx, {
      businessId, userId, action: `purchase.${action}`,
      entityType: 'PurchaseOrder', entityId: po.id,
      before: { status: po.status }, after: { status: next },
    });
    return updated;
  });
};

/**
 * Receiving goods against a PO — the transaction that turns paperwork into stock.
 *
 * All-or-nothing: accessory balance increments, device registration (unique
 * IMEIs), PO receivedQty accumulation, ledger entries, goods-receipt record,
 * PO status update and the audit entry commit together or not at all.
 */
export const receiveGoods = async ({ businessId, userId, id, body }) => {
  return withTransaction(async (tx) => {
    const po = await getPOOrThrow(tx, businessId, id);
    if (!['SUBMITTED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw ApiError.unprocessable('INVALID_STATE', `Cannot receive against a PO in status ${po.status}`);
    }
    const warehouse = await tx.warehouse.findFirst({
      where: { id: body.warehouseId, businessId, isActive: true },
    });
    if (!warehouse) throw ApiError.badRequest('Unknown or inactive warehouse');

    const itemsById = new Map(po.items.map((i) => [i.id, i]));

    const receipt = await tx.goodsReceipt.create({
      data: { businessId, purchaseOrderId: po.id, warehouseId: warehouse.id, receivedById: userId, note: body.note },
    });

    // ── Accessories: bump balances + ledger, accumulate receivedQty ──
    for (const line of body.items) {
      const poItem = itemsById.get(line.purchaseOrderItemId);
      if (!poItem) throw ApiError.badRequest(`Item ${line.purchaseOrderItemId} is not part of this PO`);
      if (poItem.variant.product.type !== 'ACCESSORY') {
        throw ApiError.badRequest(`Item ${line.purchaseOrderItemId} is IMEI-tracked — receive it via devices[]`);
      }
      const remaining = poItem.quantity - poItem.receivedQty;
      if (line.quantity > remaining) {
        throw ApiError.unprocessable('OVER_RECEIVE', `Cannot receive ${line.quantity}; only ${remaining} outstanding on this line`);
      }
      await adjustOnHand(tx, {
        businessId, warehouseId: warehouse.id, variantId: poItem.variantId,
        delta: line.quantity, type: 'RECEIPT', refType: 'PurchaseOrder', refId: po.id, userId,
      });
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id }, data: { receivedQty: { increment: line.quantity } },
      });
      await tx.goodsReceiptItem.create({
        data: { goodsReceiptId: receipt.id, purchaseOrderItemId: poItem.id, quantity: line.quantity },
      });
    }

    // ── Phones: one Device row per handset; IMEI uniqueness enforced by DB ──
    const perLineCount = new Map();
    for (const d of body.devices) {
      const poItem = itemsById.get(d.purchaseOrderItemId);
      if (!poItem) throw ApiError.badRequest(`Item ${d.purchaseOrderItemId} is not part of this PO`);
      if (poItem.variant.product.type !== 'PHONE') {
        throw ApiError.badRequest(`Item ${d.purchaseOrderItemId} is quantity-based — receive it via items[]`);
      }
      perLineCount.set(poItem.id, (perLineCount.get(poItem.id) ?? 0) + 1);
      const count = perLineCount.get(poItem.id);
      const remaining = poItem.quantity - poItem.receivedQty;
      if (count > remaining) {
        throw ApiError.unprocessable('OVER_RECEIVE', `Cannot receive ${count} devices; only ${remaining} outstanding on this line`);
      }
      try {
        const device = await tx.device.create({
          data: {
            businessId,
            variantId: poItem.variantId,
            warehouseId: warehouse.id,
            imei1: d.imei1,
            imei2: d.imei2 ?? null,
            serialNumber: d.serialNumber ?? null,
            status: 'RECEIVED',
            acquisitionCost: d.acquisitionCost ?? poItem.unitCost,
            supplierId: po.supplierId,
            purchaseItemId: poItem.id,
            goodsReceiptId: receipt.id,
            warrantyMonths: d.warrantyMonths ?? null,
          },
        });
        await adjustOnHand(tx, {
          businessId, warehouseId: warehouse.id, variantId: poItem.variantId,
          delta: 1, type: 'RECEIPT', deviceId: device.id, refType: 'PurchaseOrder', refId: po.id, userId,
        });
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id }, data: { receivedQty: { increment: 1 } },
        });
        await tx.goodsReceiptItem.create({
          data: { goodsReceiptId: receipt.id, purchaseOrderItemId: poItem.id, quantity: 1 },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw ApiError.conflict(`Duplicate IMEI: ${d.imei1}${d.imei2 ? ` / ${d.imei2}` : ''} is already registered`);
        }
        throw err;
      }
    }

    // Recompute PO status from the accumulated received quantities.
    const refreshed = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id }, include: { items: true },
    });
    const fullyReceived = refreshed.items.every((i) => i.receivedQty >= i.quantity);
    const updated = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      include: poInclude,
    });

    await writeAudit(tx, {
      businessId, userId, action: 'purchase.receive',
      entityType: 'PurchaseOrder', entityId: po.id,
      after: {
        goodsReceiptId: receipt.id,
        accessoryUnits: body.items.reduce((s, i) => s + i.quantity, 0),
        devices: body.devices.length,
        status: updated.status,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

export const listPurchaseOrders = async ({ businessId, query }) => {
  const { page, pageSize, status, supplierId } = query;
  const where = { businessId, ...(status && { status }), ...(supplierId && { supplierId }) };
  const [total, data] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: poInclude,
    }),
  ]);
  return { data, page, pageSize, total };
};

export const getPurchaseOrder = ({ businessId, id }) => getPOOrThrow(prisma, businessId, id);
