import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';

export const suppliersRoutes = Router();
suppliersRoutes.use(authenticate, resolveBusiness);

const supplierSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().max(300).optional(),
});
const supplierUpdateSchema = supplierSchema.partial().extend({ isActive: z.boolean().optional() });

suppliersRoutes.get('/', requirePermission('suppliers:read'), ah(async (req, res) => {
  const data = await prisma.supplier.findMany({
    where: { businessId: req.businessId }, orderBy: { name: 'asc' },
  });
  res.json({ data });
}));

suppliersRoutes.post('/', requirePermission('suppliers:manage'),
  validate({ body: supplierSchema }), ah(async (req, res) => {
    const data = await prisma.supplier.create({
      data: { ...req.body, businessId: req.businessId },
    });
    res.status(201).json({ data });
  }));

suppliersRoutes.patch('/:id', requirePermission('suppliers:manage'),
  validate({ body: supplierUpdateSchema }), ah(async (req, res) => {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!existing) throw ApiError.notFound('Supplier not found');
    const data = await prisma.supplier.update({ where: { id: existing.id }, data: req.body });
    res.json({ data });
  }));
