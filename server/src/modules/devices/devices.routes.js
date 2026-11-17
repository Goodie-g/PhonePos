import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { writeAudit } from '../../utils/audit.js';

export const devicesRoutes = Router();
devicesRoutes.use(authenticate, resolveBusiness);

const listQuery = z.object({
  imei: z.string().max(15).optional(),
  status: z.enum(['RECEIVED', 'AVAILABLE', 'RESERVED', 'SOLD', 'RETURNED', 'UNDER_INSPECTION', 'QUARANTINED', 'IN_TRANSIT']).optional(),
  variantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

devicesRoutes.get('/', requirePermission('devices:read'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const { page, pageSize, imei, ...filters } = req.query;
    const where = {
      businessId: req.businessId,
      ...filters,
      ...(imei && { OR: [{ imei1: { contains: imei } }, { imei2: { contains: imei } }] }),
    };
    const [total, data] = await Promise.all([
      prisma.device.count({ where }),
      prisma.device.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          variant: { select: { id: true, sku: true, storageGb: true, ramGb: true, color: true, product: { select: { name: true, brand: { select: { name: true } } } } } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);
    res.json({ data, page, pageSize, total });
  }));

devicesRoutes.get('/:id', requirePermission('devices:read'), ah(async (req, res) => {
  const data = await prisma.device.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: {
      variant: { include: { product: { include: { brand: true } } } },
      warehouse: true, supplier: true, purchaseItem: { include: { purchaseOrder: true } },
      movements: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!data) throw ApiError.notFound('Device not found');
  res.json({ data });
}));

// Receiving puts phones in RECEIVED; a warehouse user marks them AVAILABLE
// after checks. This is the only manual lifecycle transition — everything else
// is driven by orders, transfers and returns.
devicesRoutes.post('/:id/mark-available', requirePermission('devices:manage'),
  ah(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic compare-and-set on status (no race between two users).
      const updated = await tx.device.updateMany({
        where: { id: req.params.id, businessId: req.businessId, status: 'RECEIVED' },
        data: { status: 'AVAILABLE' },
      });
      if (updated.count === 0) {
        const device = await tx.device.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
        if (!device) throw ApiError.notFound('Device not found');
        throw ApiError.unprocessable('INVALID_TRANSITION', `Cannot mark AVAILABLE a device in status ${device.status}`);
      }
      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'device.mark-available',
        entityType: 'Device', entityId: req.params.id,
        before: { status: 'RECEIVED' }, after: { status: 'AVAILABLE' },
      });
      return tx.device.findUniqueOrThrow({ where: { id: req.params.id } });
    });
    res.json({ data: result });
  }));
