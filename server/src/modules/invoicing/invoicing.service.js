import { Prisma } from '@prisma/client';
import { prisma, withTransaction } from '../../db.js';
import { ApiError } from '../../utils/api-error.js';
import { nextDocNumber, dec } from '../../utils/doc-number.js';
import { writeAudit } from '../../utils/audit.js';

const invoiceInclude = {
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, orderNumber: true, status: true } },
  payments: { orderBy: { receivedAt: 'asc' } },
};

export const getInvoiceOrThrow = async (db, businessId, id) => {
  const invoice = await db.invoice.findFirst({ where: { id, businessId }, include: invoiceInclude });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
};

/**
 * Issues an invoice for a FULFILLED order.
 * Rules (documented in docs/SALES_AND_PAYMENTS.md):
 *  - exactly one active invoice per order,
 *  - totals come from the order (server-computed at order creation),
 *  - due date = issue date + customer payment terms,
 *  - credit limit: outstanding balance + new total must not exceed the limit.
 */
export const createInvoice = async ({ businessId, userId, salesOrderId }) =>
  withTransaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: salesOrderId, businessId },
      include: { customer: true, invoices: { where: { status: { not: 'VOID' } } } },
    });
    if (!order) throw ApiError.notFound('Sales order not found');
    if (order.invoices.length > 0) {
      throw ApiError.conflict('This order already has an active invoice');
    }
    if (order.status !== 'FULFILLED') {
      throw ApiError.unprocessable('INVALID_STATE',
        `An invoice can only be issued for a fully fulfilled order (current: ${order.status})`);
    }

    // Credit limit: 0 means "no limit" (cash customer by default is limit 0,
    // but a fulfilled order already exists — the limit governs NEW credit).
    const limit = dec(order.customer.creditLimit);
    if (limit.gt(0)) {
      const others = await tx.invoice.findMany({
        where: { businessId, customerId: order.customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      });
      const outstanding = others.reduce((s, inv) => s.plus(dec(inv.total).minus(inv.amountPaid)), dec(0));
      if (outstanding.plus(order.grandTotal).gt(limit)) {
        throw ApiError.unprocessable('CREDIT_LIMIT_EXCEEDED',
          `Credit limit exceeded: outstanding ${outstanding} + new ${order.grandTotal} > limit ${limit}`,
          { outstanding: outstanding.toString(), newTotal: order.grandTotal.toString(), creditLimit: limit.toString() });
      }
    }

    const invoiceNumber = await nextDocNumber(tx, businessId, 'invoice');
    const dueAt = order.customer.paymentTermsDays > 0
      ? new Date(Date.now() + order.customer.paymentTermsDays * 24 * 60 * 60 * 1000)
      : null;

    const invoice = await tx.invoice.create({
      data: {
        businessId, salesOrderId: order.id, customerId: order.customerId,
        invoiceNumber, subtotal: order.subtotal, taxTotal: order.taxTotal,
        total: order.grandTotal, dueAt,
      },
      include: invoiceInclude,
    });
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: 'INVOICED' } });
    await writeAudit(tx, {
      businessId, userId, action: 'invoice.create', entityType: 'Invoice', entityId: invoice.id,
      after: { invoiceNumber, total: order.grandTotal.toString(), orderNumber: order.orderNumber },
    });
    return invoice;
  });

/**
 * Records a payment. Concurrency-safe: the invoice row is locked FOR UPDATE,
 * so two simultaneous payments cannot both push amountPaid past the total.
 */
export const recordPayment = async ({ businessId, userId, invoiceId, body, idempotencyKey }) =>
  withTransaction(async (tx) => {
    // Lock the invoice row first (SELECT ... FOR UPDATE).
    const [locked] = await tx.$queryRaw`
      SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "businessId" = ${businessId} FOR UPDATE`;
    if (!locked) throw ApiError.notFound('Invoice not found');

    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    // Idempotency FIRST: a retry of an already-recorded payment returns the
    // original, even if the invoice has since been fully paid.
    if (idempotencyKey) {
      const existing = await tx.payment.findFirst({
        where: { businessId, idempotencyKey },
      });
      if (existing) return { payment: existing, invoice, replayed: true };
    }

    if (invoice.status === 'VOID') throw ApiError.unprocessable('INVALID_STATE', 'Invoice is void');
    if (invoice.status === 'PAID') throw ApiError.unprocessable('INVALID_STATE', 'Invoice is already fully paid');

    const amount = dec(body.amount);
    const outstanding = dec(invoice.total).minus(invoice.amountPaid);
    if (amount.gt(outstanding)) {
      throw ApiError.unprocessable('OVERPAYMENT',
        `Payment of ${amount} exceeds the outstanding balance of ${outstanding}`);
    }

    const payment = await tx.payment.create({
      data: {
        businessId, invoiceId, amount, method: body.method,
        reference: body.reference ?? null, note: body.note ?? null,
        idempotencyKey: idempotencyKey ?? null, receivedById: userId,
      },
    });
    const newPaid = dec(invoice.amountPaid).plus(amount);
    const status = newPaid.gte(invoice.total) ? 'PAID' : 'PARTIALLY_PAID';
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: newPaid, status },
      include: invoiceInclude,
    });
    await writeAudit(tx, {
      businessId, userId, action: 'payment.record', entityType: 'Payment', entityId: payment.id,
      after: { invoiceId, amount: amount.toString(), method: body.method, invoiceStatus: status },
    });
    return { payment, invoice: updatedInvoice, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export const voidInvoice = async ({ businessId, userId, id }) =>
  withTransaction(async (tx) => {
    const invoice = await getInvoiceOrThrow(tx, businessId, id);
    if (invoice.status === 'VOID') throw ApiError.unprocessable('INVALID_STATE', 'Invoice is already void');
    if (dec(invoice.amountPaid).gt(0)) {
      throw ApiError.unprocessable('INVALID_STATE', 'Cannot void an invoice with recorded payments — refund instead');
    }
    const updated = await tx.invoice.update({ where: { id }, data: { status: 'VOID' }, include: invoiceInclude });
    await writeAudit(tx, {
      businessId, userId, action: 'invoice.void', entityType: 'Invoice', entityId: id,
      before: { status: invoice.status }, after: { status: 'VOID' },
    });
    return updated;
  });

export const listInvoices = async ({ businessId, query }) => {
  const { page, pageSize, status, customerId, overdue } = query;
  const where = {
    businessId,
    ...(status && { status }),
    ...(customerId && { customerId }),
    ...(overdue && { dueAt: { lt: new Date() }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }),
  };
  const [total, data] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where, orderBy: { issuedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: invoiceInclude,
    }),
  ]);
  return { data, page, pageSize, total };
};

export const getInvoice = ({ businessId, id }) => getInvoiceOrThrow(prisma, businessId, id);

export const listPayments = async ({ businessId, query }) => {
  const page = Number(query.page ?? 1);
  const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
  const where = { businessId, ...(query.invoiceId && { invoiceId: query.invoiceId }) };
  const [total, data] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where, orderBy: { receivedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: { invoice: { select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } } },
    }),
  ]);
  return { data, page, pageSize, total };
};
