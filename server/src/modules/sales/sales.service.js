import { Prisma } from '@prisma/client';
import { prisma, withTransaction } from '../../db.js';
import { ApiError } from '../../utils/api-error.js';
import { nextDocNumber, dec } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';
import { adjustOnHand, reserve, releaseReserved, removeUnits } from '../../services/stock.js';

const orderInclude = {
  customer: { select: { id: true, code: true, name: true, status: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  items: {
    include: {
      variant: { include: { product: { include: { brand: true } } } },
      reservations: true,
    },
  },
};

export const getOrderOrThrow = async (db, businessId, id) => {
  const order = await db.salesOrder.findFirst({ where: { id, businessId }, include: orderInclude });
  if (!order) throw ApiError.notFound('Sales order not found');
  return order;
};

/**
 * Server-authoritative price resolution.
 * Priority: best matching quantity tier in the customer's price list
 * (else the business default list) -> variant's standard sellPrice.
 * The client NEVER sends prices.
 */
export const resolveUnitPrice = async (tx, { businessId, customer, variant, quantity }) => {
  let priceListId = customer.priceListId;
  if (!priceListId) {
    const def = await tx.priceList.findFirst({ where: { businessId, isDefault: true } });
    priceListId = def?.id;
  }
  if (priceListId) {
    const tier = await tx.priceListItem.findFirst({
      where: { priceListId, variantId: variant.id, minQty: { lte: quantity } },
      orderBy: { minQty: 'desc' },
    });
    if (tier) return dec(tier.unitPrice);
  }
  return dec(variant.sellPrice);
};

export const createOrder = async ({ businessId, userId, body }) => {
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, businessId } });
  if (!customer) throw ApiError.badRequest('Unknown customer');
  if (customer.status !== 'ACTIVE') {
    throw ApiError.unprocessable('CUSTOMER_INACTIVE', `Customer is ${customer.status.toLowerCase()}`);
  }
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: body.warehouseId, businessId, isActive: true },
  });
  if (!warehouse) throw ApiError.badRequest('Unknown or inactive warehouse');

  const variantIds = body.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, businessId },
    include: { product: true },
  });
  if (variants.length !== new Set(variantIds).size) {
    throw ApiError.badRequest('One or more variants do not belong to this business');
  }
  const discontinued = variants.find((v) => v.product.status !== 'ACTIVE');
  if (discontinued) {
    throw ApiError.unprocessable('PRODUCT_DISCONTINUED', `"${discontinued.product.name}" is discontinued`);
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

  return withTransaction(async (tx) => {
    const variantById = new Map(variants.map((v) => [v.id, v]));
    let subtotal = dec(0);
    let discountTotal = dec(0);
    const lineData = [];

    for (const item of body.items) {
      const variant = variantById.get(item.variantId);
      const unitPrice = await resolveUnitPrice(tx, { businessId, customer, variant, quantity: item.quantity });
      const gross = unitPrice.times(item.quantity);
      const discount = Prisma.Decimal.min(gross, dec(item.discount ?? 0)); // cap at gross
      const lineTotal = gross.minus(discount);
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(discount);
      lineData.push({
        variantId: variant.id, quantity: item.quantity,
        unitPrice, discount, lineTotal,
      });
    }

    const taxTotal = subtotal.minus(discountTotal).times(business.taxRatePercent).dividedBy(100);
    const grandTotal = subtotal.minus(discountTotal).plus(taxTotal);
    const orderNumber = await nextDocNumber(tx, businessId, 'salesOrder');

    const order = await tx.salesOrder.create({
      data: {
        businessId, customerId: customer.id, warehouseId: warehouse.id,
        orderNumber, status: 'DRAFT', notes: body.notes, createdById: userId,
        subtotal, discountTotal, taxTotal, grandTotal,
        items: { create: lineData },
      },
      include: orderInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'order.create',
      entityType: 'SalesOrder', entityId: order.id,
      after: { orderNumber, grandTotal: grandTotal.toString() },
    });
    return order;
  });
};

export const submitOrder = async ({ businessId, userId, id }) =>
  withTransaction(async (tx) => {
    const order = await getOrderOrThrow(tx, businessId, id);
    if (order.status !== 'DRAFT') {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot submit an order in status ${order.status}`);
    }
    const updated = await tx.salesOrder.update({ where: { id }, data: { status: 'SUBMITTED' }, include: orderInclude });
    await writeAudit(tx, {
      businessId, userId, action: 'order.submit', entityType: 'SalesOrder', entityId: id,
      before: { status: 'DRAFT' }, after: { status: 'SUBMITTED' },
    });
    return updated;
  });

/**
 * Confirm: reserve all stock atomically.
 *  - Accessories: atomic available-quantity reservation (raw SQL, no oversell).
 *  - Phones: auto-allocate AVAILABLE devices via conditional UPDATE
 *    (compare-and-set), so two concurrent confirms cannot grab the same handset.
 */
export const confirmOrder = async ({ businessId, userId, id }) =>
  withTransaction(async (tx) => {
    const order = await getOrderOrThrow(tx, businessId, id);
    if (order.status !== 'SUBMITTED') {
      throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot confirm an order in status ${order.status}`);
    }

    for (const item of order.items) {
      if (item.variant.product.type === 'ACCESSORY') {
        await reserve(tx, {
          businessId, warehouseId: order.warehouseId, variantId: item.variantId,
          amount: item.quantity, refType: 'SalesOrder', refId: order.id, userId,
        });
        await tx.stockReservation.create({
          data: {
            businessId, orderItemId: item.id, warehouseId: order.warehouseId,
            variantId: item.variantId, quantity: item.quantity,
          },
        });
      } else {
        // Find candidate devices, then claim them atomically.
        const candidates = await tx.device.findMany({
          where: {
            businessId, warehouseId: order.warehouseId,
            variantId: item.variantId, status: 'AVAILABLE',
          },
          select: { id: true }, take: item.quantity,
        });
        if (candidates.length < item.quantity) {
          throw ApiError.unprocessable('INSUFFICIENT_STOCK',
            `Not enough available devices for ${item.variant.sku} (need ${item.quantity}, found ${candidates.length})`);
        }
        const ids = candidates.map((c) => c.id);
        const claimed = await tx.device.updateMany({
          where: { id: { in: ids }, status: 'AVAILABLE' }, // compare-and-set
          data: { status: 'RESERVED', reservedOrderItemId: item.id },
        });
        if (claimed.count !== ids.length) {
          throw ApiError.unprocessable('INSUFFICIENT_STOCK',
            'Some devices were claimed by a concurrent order — please retry');
        }
      }
    }

    const updated = await tx.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED' }, include: orderInclude });
    await writeAudit(tx, {
      businessId, userId, action: 'order.confirm', entityType: 'SalesOrder', entityId: id,
      before: { status: 'SUBMITTED' }, after: { status: 'CONFIRMED' },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

/**
 * Fulfil (fully or partially): turns reservations into outbound stock movements.
 * Accessories: consume reservation + decrement onHand.
 * Phones: the specified devices must be RESERVED for this order line -> SOLD.
 */
export const fulfilOrder = async ({ businessId, userId, id, body }) =>
  withTransaction(async (tx) => {
    const order = await getOrderOrThrow(tx, businessId, id);
    if (!['CONFIRMED', 'PARTIALLY_FULFILLED'].includes(order.status)) {
      throw ApiError.unprocessable('INVALID_STATE', `Cannot fulfil an order in status ${order.status}`);
    }
    const itemsById = new Map(order.items.map((i) => [i.id, i]));

    for (const line of body.items) {
      const item = itemsById.get(line.orderItemId);
      if (!item) throw ApiError.badRequest(`Item ${line.orderItemId} is not part of this order`);
      const outstanding = item.quantity - item.fulfilledQty;

      if (item.variant.product.type === 'ACCESSORY') {
        const qty = line.quantity ?? 0;
        if (!qty || qty > outstanding) {
          throw ApiError.unprocessable('OVER_FULFIL', `Cannot fulfil ${qty}; ${outstanding} outstanding on this line`);
        }
        await releaseReserved(tx, {
          businessId, warehouseId: order.warehouseId, variantId: item.variantId,
          amount: qty, type: 'SALE', refType: 'SalesOrder', refId: order.id, userId,
        });
        await adjustOnHand(tx, {
          businessId, warehouseId: order.warehouseId, variantId: item.variantId,
          delta: -qty, type: 'SALE', refType: 'SalesOrder', refId: order.id, userId,
        });
        // Reservation rows are only consumed once the line is fully fulfilled
        // (a partial fulfilment keeps the remaining reservation ACTIVE).
        if (item.fulfilledQty + qty >= item.quantity) {
          await tx.stockReservation.updateMany({
            where: { orderItemId: item.id, status: 'ACTIVE' },
            data: { status: 'CONSUMED' },
          });
        }
        await tx.salesOrderItem.update({ where: { id: item.id }, data: { fulfilledQty: { increment: qty } } });
      } else {
        const deviceIds = line.deviceIds ?? [];
        if (deviceIds.length === 0 || deviceIds.length > outstanding) {
          throw ApiError.unprocessable('OVER_FULFIL',
            `Cannot fulfil ${deviceIds.length} devices; ${outstanding} outstanding on this line`);
        }
        const sold = await tx.device.updateMany({
          where: {
            id: { in: deviceIds }, businessId, status: 'RESERVED', reservedOrderItemId: item.id,
          },
          data: { status: 'SOLD', soldOrderItemId: item.id, reservedOrderItemId: null },
        });
        if (sold.count !== deviceIds.length) {
          throw ApiError.unprocessable('DEVICE_STATE',
            'Some devices are not RESERVED for this order line (wrong device, or already sold)');
        }
        await removeUnits(tx, {
          businessId, warehouseId: order.warehouseId, type: 'SALE',
          refType: 'SalesOrder', refId: order.id, userId,
          units: deviceIds.map((deviceId) => ({ variantId: item.variantId, quantity: 1, deviceId })),
        });
        await tx.salesOrderItem.update({
          where: { id: item.id }, data: { fulfilledQty: { increment: deviceIds.length } },
        });
      }
    }

    const refreshed = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const complete = refreshed.items.every((i) => i.fulfilledQty >= i.quantity);
    const updated = await tx.salesOrder.update({
      where: { id },
      data: { status: complete ? 'FULFILLED' : 'PARTIALLY_FULFILLED' },
      include: orderInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'order.fulfil', entityType: 'SalesOrder', entityId: id,
      after: { status: updated.status, lines: body.items.length },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

/** Cancel releases every remaining reservation. Not allowed once fulfilment started. */
export const cancelOrder = async ({ businessId, userId, id }) =>
  withTransaction(async (tx) => {
    const order = await getOrderOrThrow(tx, businessId, id);
    if (!['DRAFT', 'SUBMITTED', 'CONFIRMED'].includes(order.status)) {
      throw ApiError.unprocessable('INVALID_TRANSITION',
        `Cannot cancel an order in status ${order.status} — use a return instead`);
    }

    for (const item of order.items) {
      if (item.variant.product.type === 'ACCESSORY') {
        const active = item.reservations.filter((r) => r.status === 'ACTIVE');
        for (const r of active) {
          await releaseReserved(tx, {
            businessId, warehouseId: r.warehouseId, variantId: r.variantId,
            amount: r.quantity, type: 'RELEASE', refType: 'SalesOrder', refId: order.id, userId,
          });
          await tx.stockReservation.update({ where: { id: r.id }, data: { status: 'RELEASED' } });
        }
      } else {
        await tx.device.updateMany({
          where: { businessId, status: 'RESERVED', reservedOrderItemId: item.id },
          data: { status: 'AVAILABLE', reservedOrderItemId: null },
        });
      }
    }

    const updated = await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: orderInclude });
    await writeAudit(tx, {
      businessId, userId, action: 'order.cancel', entityType: 'SalesOrder', entityId: id,
      before: { status: order.status }, after: { status: 'CANCELLED' },
    });
    return updated;
  });

export const listOrders = async ({ businessId, query }) => {
  const { page, pageSize, status, customerId, warehouseId } = query;
  const where = { businessId, ...(status && { status }), ...(customerId && { customerId }), ...(warehouseId && { warehouseId }) };
  const [total, data] = await Promise.all([
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: orderInclude,
    }),
  ]);
  return { data, page, pageSize, total };
};

export const getOrder = ({ businessId, id }) => getOrderOrThrow(prisma, businessId, id);
