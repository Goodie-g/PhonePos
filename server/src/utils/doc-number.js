import { Prisma } from '@prisma/client';

const PREFIX = {
  purchaseOrder: 'PO',
  goodsReceipt: 'GRN',
  salesOrder: 'SO',
  invoice: 'INV',
  transfer: 'TRF',
  shipment: 'SHP',
  return: 'RET',
  customer: 'CUST',
};

/**
 * Allocates the next human-facing document number for a business, e.g. "SO-000042".
 *
 * Concurrency: the upsert + increment runs inside the caller's transaction.
 * The increment (`value: { increment: 1 }`) is an atomic SQL UPDATE on a single
 * row keyed by (businessId, type), so concurrent transactions serialize on
 * that row and can never receive the same number.
 */
export const nextDocNumber = async (tx, businessId, type) => {
  const prefix = PREFIX[type];
  if (!prefix) throw new Error(`Unknown document type: ${type}`);
  const counter = await tx.documentCounter.upsert({
    where: { businessId_type: { businessId, type } },
    create: { businessId, type, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(counter.value).padStart(6, '0')}`;
};

/** Money helper — always compute with Decimal, never JS floats. */
export const dec = (v) => new Prisma.Decimal(v ?? 0);
