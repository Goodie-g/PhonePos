import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';

export const warehousesRoutes = Router();
warehousesRoutes.use(authenticate, resolveBusiness);

const warehouseSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  address: z.string().max(300).optional(),
});
const warehouseUpdateSchema = warehouseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

warehousesRoutes.get('/', ah(async (req, res) => {
  const data = await prisma.warehouse.findMany({
    where: { businessId: req.businessId }, orderBy: { name: 'asc' },
  });
  res.json({ data });
}));

warehousesRoutes.post('/', requirePermission('warehouses:manage'),
  validate({ body: warehouseSchema }), ah(async (req, res) => {
    const data = await prisma.warehouse.create({
      data: { ...req.body, code: req.body.code.toUpperCase(), businessId: req.businessId },
    });
    res.status(201).json({ data });
  }));

warehousesRoutes.patch('/:id', requirePermission('warehouses:manage'),
  validate({ body: warehouseUpdateSchema }), ah(async (req, res) => {
    const existing = await prisma.warehouse.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!existing) throw ApiError.notFound('Warehouse not found');
    const data = await prisma.warehouse.update({
      where: { id: existing.id },
      data: { ...req.body, code: req.body.code?.toUpperCase() },
    });
    res.json({ data });
  }));
