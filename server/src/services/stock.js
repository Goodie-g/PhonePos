import { ApiError } from '../utils/api-error.js';

/**
 * Stock service — the ONLY code allowed to change InventoryBalance rows or
 * insert StockMovement rows. Every mutation:
 *   1. runs inside the caller's transaction (tx),
 *   2. uses a conditional UPDATE so balances can never silently go negative
 *      (safe under concurrent requests — the database enforces it, not the UI),
 *   3. writes an append-only StockMovement ledger entry.
 */

/** Increase/decrease onHand. Throws INSUFFICIENT_STOCK instead of going negative. */
export const adjustOnHand = async (
  tx,
  { businessId, warehouseId, variantId, delta, type, deviceId = null, refType = null, refId = null, note = null, userId = null }
) => {
  if (delta === 0) throw new Error('adjustOnHand requires a non-zero delta');

  if (delta > 0) {
    await tx.inventoryBalance.upsert({
      where: { warehouseId_variantId: { warehouseId, variantId } },
      create: { businessId, warehouseId, variantId, onHand: delta },
      update: { onHand: { increment: delta } },
    });
  } else {
    // Atomic compare-and-set: only succeeds if enough stock exists RIGHT NOW.
    const result = await tx.inventoryBalance.updateMany({
      where: { warehouseId, variantId, businessId, onHand: { gte: -delta } },
      data: { onHand: { increment: delta } },
    });
    if (result.count === 0) {
      throw ApiError.unprocessable('INSUFFICIENT_STOCK', 'Insufficient stock at this warehouse', {
        variantId,
        warehouseId,
        requested: -delta,
      });
    }
  }

  await tx.stockMovement.create({
    data: {
      businessId, warehouseId, variantId, deviceId, type,
      quantity: delta, refType, refId, note, createdById: userId,
    },
  });
};

/**
 * Reserve `amount` units (onHand - reserved >= amount must hold).
 * Raw SQL so the availability check and the increment are ONE atomic UPDATE:
 * two concurrent reservations cannot both succeed on the last units.
 */
export const reserve = async (
  tx,
  { businessId, warehouseId, variantId, amount, refType = null, refId = null, userId = null }
) => {
  if (amount <= 0) throw new Error('reserve requires a positive amount');
  const updated = await tx.$executeRaw`
    UPDATE "InventoryBalance"
       SET "reserved" = "reserved" + ${amount}, "updatedAt" = now()
     WHERE "businessId" = ${businessId}
       AND "warehouseId" = ${warehouseId}
       AND "variantId" = ${variantId}
       AND "onHand" - "reserved" >= ${amount}`;
  if (updated === 0) {
    throw ApiError.unprocessable('INSUFFICIENT_STOCK', 'Not enough available stock to reserve', {
      variantId, warehouseId, requested: amount,
    });
  }
  await tx.stockMovement.create({
    data: { businessId, warehouseId, variantId, type: 'RESERVE', quantity: 0, refType, refId, createdById: userId },
  });
};

/** Release or consume a reservation (reserved decreases; must not go negative). */
export const releaseReserved = async (
  tx,
  { businessId, warehouseId, variantId, amount, type, refType = null, refId = null, userId = null }
) => {
  if (amount <= 0) throw new Error('releaseReserved requires a positive amount');
  if (!['RELEASE', 'SALE'].includes(type)) throw new Error('type must be RELEASE or SALE');
  const result = await tx.inventoryBalance.updateMany({
    where: { warehouseId, variantId, businessId, reserved: { gte: amount } },
    data: { reserved: { increment: -amount } },
  });
  if (result.count === 0) {
    throw ApiError.unprocessable('RESERVATION_MISMATCH', 'Reserved quantity is smaller than requested');
  }
  await tx.stockMovement.create({
    data: { businessId, warehouseId, variantId, type, quantity: 0, refType, refId, createdById: userId },
  });
};

/** Available stock for one variant at one warehouse (for reads/UI). */
export const availability = async (db, { warehouseId, variantId }) => {
  const balance = await db.inventoryBalance.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId } },
  });
  const onHand = balance?.onHand ?? 0;
  const reserved = balance?.reserved ?? 0;
  return { onHand, reserved, available: onHand - reserved };
};
