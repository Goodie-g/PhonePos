import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const brandSchema = z.object({ name: z.string().min(1).max(80) });
export const categorySchema = z.object({ name: z.string().min(1).max(80) });

export const productSchema = z.object({
  brandId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  type: z.enum(['PHONE', 'ACCESSORY']),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().max(500).optional(),
});

export const productUpdateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['ACTIVE', 'DISCONTINUED']).optional(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
});

const money = z.coerce.number().nonnegative().multipleOf(0.0001);

export const variantSchema = z.object({
  sku: z.string().min(1).max(60),
  barcode: z.string().max(60).optional(),
  storageGb: z.coerce.number().int().positive().optional(),
  ramGb: z.coerce.number().int().positive().optional(),
  color: z.string().max(40).optional(),
  costPrice: money.default(0),
  sellPrice: money,
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
});

export const variantUpdateSchema = variantSchema.partial().omit({ sku: true }).extend({
  sku: z.string().min(1).max(60).optional(),
});

export const productListQuery = paginationQuery.extend({
  search: z.string().max(120).optional(),
  type: z.enum(['PHONE', 'ACCESSORY']).optional(),
  status: z.enum(['ACTIVE', 'DISCONTINUED']).optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  sort: z.enum(['name', '-name', 'newest', 'oldest']).default('name'),
});
