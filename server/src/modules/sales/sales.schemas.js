import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().int().positive().max(100000),
        // Optional absolute per-line discount; the server caps it at the line gross.
        discount: z.coerce.number().nonnegative().default(0),
      })
    )
    .min(1),
});

export const fulfilSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.coerce.number().int().positive().optional(), // accessories
        deviceIds: z.array(z.string().uuid()).max(500).optional(), // phones
      })
    )
    .min(1),
});

export const orderListQuery = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'INVOICED', 'CANCELLED']).optional(),
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
