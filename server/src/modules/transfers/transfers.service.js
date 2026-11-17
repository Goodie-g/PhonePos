import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError } from '../../utils/api-error.js';
import { nextDocNumber } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';
import { adjustOnHand } from '../../services/stock.js';

const transferInclude = {
  fromWarehouse: { select: { id: true, name: true, code: true } },
  toWarehouse: { select: { id: true, name: true, code: true } },
  items: { include: { variant: { include: { product: { select: { name: true, type: true } } } } } },
  devices: { include: { device: { select: { id: true, imei1: true, status: true, variantId: true } } } },
};

const getTransferOrThrow = async (db, businessId, id) => {
  const transfer = await db.stockTransfer.findFirst({ where: { id, businessId }, include: transferInclude });
  if (!transfer) throw ApiError.notFound('Transfer not found');
  return transfer;
};

export const createTransfer = async ({ businessId, userId, body }) => {
  if (body.fromWarehouseId === body.toWarehouseId) {
    throw ApiError.badRequest('Source and destination must be different warehouses');
  }
  const [from, to] = await Promise.all([
    prisma.warehouse.findFirst({ where: { id: body.fromWarehouseId, businessId, isActive: true } }),
    prisma.warehouse.findFirst({ where: { id: body.toWarehouseId, businessId, isActive: true } }),
  ]);
  if (!from || !to) throw ApiError.badRequest('Unknown or inactive warehouse');

  return prisma.$transaction(async (tx) => {
    // Validate accessory items.
    const variantIds = (body.items ?? []).map((i) => i.variantId);
    if (variantIds.length > 0) {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds }, businessId }, include: { product: true },
      });
      if (variants.length !== new Set(variantIds).size) throw ApiError.badRequest('Unknown variant');
      const phoneVariant = variants.find((v) => v.product.type === 'PHONE');
      if (phoneVariant) throw ApiError.badRequest('Phones are transferred via deviceIds, not quantities');
    }
    // Validate devices: must be AVAILABLE at the source warehouse.
    const deviceIds = body.deviceIds ?? [];
    if (deviceIds.length > 0) {
      const devices = await tx.device.findMany({
        where: { id: { in: deviceIds }, businessId },
        select: { id: true, status: true, warehouseId: true, imei1: true },
      });
      if (devices.length !== new Set(deviceIds).size) throw ApiError.badRequest('Unknown device in list');
      const bad = devices.find((d) => d.status !== 'AVAILABLE' || d.warehouseId !== body.fromWarehouseId);
      if (bad) {
        throw ApiError.unprocessable('DEVICE_STATE',
          `Device ${bad.imei1} is not available at the source warehouse (status: ${bad.status})`);
      }
    }

    const transferNumber = await nextDocNumber(tx, businessId, 'transfer');
    const transfer = await tx.stockTransfer.create({
      data: {
        businessId, fromWarehouseId: from.id, toWarehouseId: to.id,
        transferNumber, note: body.note, createdById: userId, status: 'DRAFT',
        items: { create: (body.items ?? []).map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
        devices: { create: deviceIds.map((deviceId) => ({ deviceId })) },
      },
      include: transferInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'transfer.create',
      entityType: 'StockTransfer', entityId: transfer.id, after: { transferNumber },
    });
    return transfer;
  });
};

/**
 * Dispatch: stock leaves the source warehouse.
 * Accessories: conditional decrement (never negative). Devices: AVAILABLE ->
 * IN_TRANSIT via compare-and-set. Nothing arrives anywhere yet — goods are
 * in transit until receive() confirms them.
 */
export const dispatchTransfer = async ({ businessId, userId, id }) =>
  prisma.$transaction(async (tx) => {
    const transfer = await getTransferOrThrow(tx, businessId, id);
    if (transfer.status !== 'DRAFT') {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot dispatch a transfer in status ${transfer.status}`);
    }

    for (const item of transfer.items) {
      await adjustOnHand(tx, {
        businessId, warehouseId: transfer.fromWarehouseId, variantId: item.variantId,
        delta: -item.quantity, type: 'TRANSFER_OUT', refType: 'StockTransfer', refId: id, userId,
      });
    }
    for (const td of transfer.devices) {
      const claimed = await tx.device.updateMany({
        where: { id: td.deviceId, businessId, status: 'AVAILABLE', warehouseId: transfer.fromWarehouseId },
        data: { status: 'IN_TRANSIT' },
      });
      if (claimed.count === 0) {
        throw ApiError.unprocessable('DEVICE_STATE', `Device ${td.device.imei1} is no longer available at the source`);
      }
      await adjustOnHand(tx, {
        businessId, warehouseId: transfer.fromWarehouseId, variantId: td.device.variantId,
        delta: -1, type: 'TRANSFER_OUT', deviceId: td.deviceId, refType: 'StockTransfer', refId: id, userId,
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() }, include: transferInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'transfer.dispatch', entityType: 'StockTransfer', entityId: id,
      before: { status: 'DRAFT' }, after: { status: 'DISPATCHED' },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

/** Receive (fully or partially). May be called repeatedly until complete. */
export const receiveTransfer = async ({ businessId, userId, id, body }) =>
  prisma.$transaction(async (tx) => {
    const transfer = await getTransferOrThrow(tx, businessId, id);
    if (!['DISPATCHED', 'PARTIALLY_RECEIVED'].includes(transfer.status)) {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot receive a transfer in status ${transfer.status}`);
    }

    const itemByVariant = new Map(transfer.items.map((i) => [i.variantId, i]));
    for (const line of body.items ?? []) {
      const item = itemByVariant.get(line.variantId);
      if (!item) throw ApiError.badRequest(`Variant ${line.variantId} is not part of this transfer`);
      const outstanding = item.quantity - item.receivedQty;
      if (line.quantity > outstanding) {
        throw ApiError.unprocessable('OVER_RECEIVE', `Cannot receive ${line.quantity}; ${outstanding} outstanding`);
      }
      await adjustOnHand(tx, {
        businessId, warehouseId: transfer.toWarehouseId, variantId: line.variantId,
        delta: line.quantity, type: 'TRANSFER_IN', refType: 'StockTransfer', refId: id, userId,
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQty: { increment: line.quantity } } });
    }

    const transferDeviceIds = new Set(transfer.devices.map((d) => d.deviceId));
    for (const deviceId of body.deviceIds ?? []) {
      if (!transferDeviceIds.has(deviceId)) throw ApiError.badRequest(`Device ${deviceId} is not part of this transfer`);
      const device = await tx.device.findUniqueOrThrow({ where: { id: deviceId } });
      const claimed = await tx.device.updateMany({
        where: { id: deviceId, businessId, status: 'IN_TRANSIT' },
        data: { status: 'AVAILABLE', warehouseId: transfer.toWarehouseId },
      });
      if (claimed.count === 0) {
        throw ApiError.unprocessable('DEVICE_STATE', `Device ${device.imei1} is not in transit (status: ${device.status})`);
      }
      await tx.stockTransferDevice.updateMany({
        where: { transferId: id, deviceId, receivedAt: null },
        data: { receivedAt: new Date() },
      });
      await adjustOnHand(tx, {
        businessId, warehouseId: transfer.toWarehouseId, variantId: device.variantId,
        delta: 1, type: 'TRANSFER_IN', deviceId, refType: 'StockTransfer', refId: id, userId,
      });
    }

    // Recompute completion.
    const refreshed = await tx.stockTransfer.findUniqueOrThrow({
      where: { id }, include: { items: true, devices: true },
    });
    const itemsDone = refreshed.items.every((i) => i.receivedQty >= i.quantity);
    const devicesDone = refreshed.devices.every((d) => d.receivedAt !== null);
    const anyProgress = refreshed.items.some((i) => i.receivedQty > 0) || refreshed.devices.some((d) => d.receivedAt !== null);
    const status = itemsDone && devicesDone ? 'RECEIVED' : anyProgress ? 'PARTIALLY_RECEIVED' : 'DISPATCHED';
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status, completedAt: status === 'RECEIVED' ? new Date() : null },
      include: transferInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'transfer.receive', entityType: 'StockTransfer', entityId: id,
      after: { status },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

/**
 * Cancel. DRAFT: trivially cancelled. After dispatch: everything NOT yet
 * received is returned to the source warehouse ("never actually shipped").
 * Genuinely lost goods are then written off via a stock adjustment with a
 * reason — so the ledger always explains every unit.
 */
export const cancelTransfer = async ({ businessId, userId, id }) =>
  prisma.$transaction(async (tx) => {
    const transfer = await getTransferOrThrow(tx, businessId, id);
    if (!['DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED'].includes(transfer.status)) {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot cancel a transfer in status ${transfer.status}`);
    }

    if (transfer.status !== 'DRAFT') {
      for (const item of transfer.items) {
        const outstanding = item.quantity - item.receivedQty;
        if (outstanding > 0) {
          await adjustOnHand(tx, {
            businessId, warehouseId: transfer.fromWarehouseId, variantId: item.variantId,
            delta: outstanding, type: 'TRANSFER_IN', refType: 'StockTransfer', refId: id,
            note: 'Transfer cancelled — returned to source', userId,
          });
        }
      }
      for (const td of transfer.devices) {
        if (td.receivedAt === null) {
          await tx.device.updateMany({
            where: { id: td.deviceId, businessId, status: 'IN_TRANSIT' },
            data: { status: 'AVAILABLE' },
          });
          const device = await tx.device.findUniqueOrThrow({ where: { id: td.deviceId } });
          await adjustOnHand(tx, {
            businessId, warehouseId: transfer.fromWarehouseId, variantId: device.variantId,
            delta: 1, type: 'TRANSFER_IN', deviceId: td.deviceId, refType: 'StockTransfer', refId: id,
            note: 'Transfer cancelled — returned to source', userId,
          });
        }
      }
    }

    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' }, include: transferInclude });
    await writeAudit(tx, {
      businessId, userId, action: 'transfer.cancel', entityType: 'StockTransfer', entityId: id,
      before: { status: transfer.status }, after: { status: 'CANCELLED' },
    });
    return updated;
  });

export const listTransfers = async ({ businessId, query }) => {
  const page = Number(query.page ?? 1);
  const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
  const where = { businessId, ...(query.status && { status: query.status }) };
  const [total, data] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: transferInclude,
    }),
  ]);
  return { data, page, pageSize, total };
};

export const getTransfer = ({ businessId, id }) => getTransferOrThrow(prisma, businessId, id);
