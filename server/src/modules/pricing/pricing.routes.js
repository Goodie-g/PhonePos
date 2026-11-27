import { Router } from 'express';
import { z } from 'zod';
import { prisma, withTransaction } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';

export const pricingRoutes = Router();
pricingRoutes.use(authenticate, resolveBusiness);

const priceListSchema = z.object({ name: z.string().min(1).max(80), isDefault: z.boolean().optional() });

const priceItemSchema = z.object({
  variantId: z.string().uuid(),
  minQty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

pricingRoutes.get('/', requirePermission('pricelists:read'), ah(async (req, res) => {
  const data = await prisma.priceList.findMany({
    where: { businessId: req.businessId },
    include: { items: { include: { variant: { select: { id: true, sku: true, product: { select: { name: true } } } } }, orderBy: [{ variantId: 'asc' }, { minQty: 'asc' }] } },
    orderBy: { name: 'asc' },
  });
  res.json({ data });
}));

pricingRoutes.post('/', requirePermission('pricelists:manage'),
  validate({ body: priceListSchema }),
  ah(async (req, res) => {
    const data = await withTransaction(async (tx) => {
      if (req.body.isDefault) {
        await tx.priceList.updateMany({
          where: { businessId: req.businessId, isDefault: true }, data: { isDefault: false },
        });
      }
      return tx.priceList.create({
        data: { businessId: req.businessId, name: req.body.name, isDefault: req.body.isDefault ?? false },
      });
    });
    res.status(201).json({ data });
  }));

// Add or replace a quantity tier (upsert on priceList+variant+minQty).
pricingRoutes.post('/:id/items', requirePermission('pricelists:manage'),
  validate({ body: priceItemSchema }),
  ah(async (req, res) => {
    const priceList = await prisma.priceList.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!priceList) throw ApiError.notFound('Price list not found');
    const variant = await prisma.productVariant.findFirst({
      where: { id: req.body.variantId, businessId: req.businessId },
    });
    if (!variant) throw ApiError.badRequest('Unknown variant');
    const data = await prisma.priceListItem.upsert({
      where: {
        priceListId_variantId_minQty: {
          priceListId: priceList.id, variantId: variant.id, minQty: req.body.minQty,
        },
      },
      create: { priceListId: priceList.id, variantId: variant.id, minQty: req.body.minQty, unitPrice: req.body.unitPrice },
      update: { unitPrice: req.body.unitPrice },
    });
    res.status(201).json({ data });
  }));

pricingRoutes.delete('/:id/items/:itemId', requirePermission('pricelists:manage'),
  ah(async (req, res) => {
    const item = await prisma.priceListItem.findFirst({
      where: { id: req.params.itemId, priceList: { id: req.params.id, businessId: req.businessId } },
    });
    if (!item) throw ApiError.notFound('Price tier not found');
    await prisma.priceListItem.delete({ where: { id: item.id } });
    res.status(204).end();
  }));
