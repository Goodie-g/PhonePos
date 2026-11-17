import { z } from 'zod';
import { imeiSchema } from '../../utils/imei.js';

export const createPOSchema = z.object({
  supplierId: z.string().uuid(),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().int().positive().max(100000),
        unitCost: z.coerce.number().nonnegative(),
      })
    )
    .min(1, 'A purchase order needs at least one item'),
});

export const receiveSchema = z
  .object({
    warehouseId: z.string().uuid(),
    note: z.string().max(500).optional(),
    // Quantity-based receiving (accessories)
    items: z
      .array(
        z.object({
          purchaseOrderItemId: z.string().uuid(),
          quantity: z.coerce.number().int().positive(),
        })
      )
      .default([]),
    // Unit-based receiving (IMEI-tracked phones)
    devices: z
      .array(
        z.object({
          purchaseOrderItemId: z.string().uuid(),
          imei1: imeiSchema,
          imei2: imeiSchema.optional(),
          serialNumber: z.string().max(60).optional(),
          acquisitionCost: z.coerce.number().nonnegative().optional(),
          warrantyMonths: z.coerce.number().int().min(0).max(120).optional(),
        })
      )
      .default([]),
  })
  .refine((v) => v.items.length + v.devices.length > 0, {
    message: 'Nothing to receive — provide items and/or devices',
  });

export const poListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  supplierId: z.string().uuid().optional(),
});
