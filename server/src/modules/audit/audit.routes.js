import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';

export const auditRoutes = Router();
auditRoutes.use(authenticate, resolveBusiness);

// Read-only audit trail. Audit rows are never updated or deleted by the API.
auditRoutes.get('/', requirePermission('audit:read'),
  validate({
    query: z.object({
      entityType: z.string().max(60).optional(),
      entityId: z.string().max(80).optional(),
      action: z.string().max(60).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  ah(async (req, res) => {
    const { page, pageSize, ...filters } = req.query;
    const where = { businessId: req.businessId, ...filters };
    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    res.json({ data, page, pageSize, total });
  }));
