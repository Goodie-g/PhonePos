import { z } from 'zod';

export const createInvoiceSchema = z.object({
  salesOrderId: z.string().uuid(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  reference: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
});

export const invoiceListQuery = z.object({
  status: z.enum(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(),
  customerId: z.string().uuid().optional(),
  overdue: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
