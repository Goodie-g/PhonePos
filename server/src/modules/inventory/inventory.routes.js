import { Router } from 'express';
import { z } from 'zod';
import { prisma, withTransaction } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { adjustOnHand } from '../../services/stock.js';
import { writeAudit } from '../../utils/audit.js';

export const inventoryRoutes = Router();
inventoryRoutes.use(authenticate, resolveBusiness);

const balancesQuery = z.object({
  warehouseId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// Stock position per variant per warehouse. `available` is what can be sold.
inventoryRoutes.get('/balances', requirePermission('inventory:read'),
  validate({ query: balancesQuery }),
  ah(async (req, res) => {
    const { warehouseId, variantId, page, pageSize } = req.query;
    const where = {
      businessId: req.businessId,
      ...(warehouseId && { warehouseId }),
      ...(variantId && { variantId }),
    };
    const [total, rows] = await Promise.all([
      prisma.inventoryBalance.count({ where }),
      prisma.inventoryBalance.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{ warehouseId: 'asc' }, { variantId: 'asc' }],
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          variant: {
            select: {
              id: true, sku: true, storageGb: true, ramGb: true, color: true,
              sellPrice: true, costPrice: true, lowStockThreshold: true,
              product: { select: { id: true, name: true, type: true, brand: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);
    let data = rows.map((r) => ({
      ...r,
      available: r.onHand - r.reserved,
      isLow: r.onHand - r.reserved <= r.variant.lowStockThreshold,
    }));
    if (req.query.lowStock) data = data.filter((r) => r.isLow);
    res.json({ data, page, pageSize, total });
  }));

const movementsQuery = z.object({
  warehouseId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  type: z.enum(['RECEIPT', 'SALE', 'RESERVE', 'RELEASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'RETURN', 'RETURN_OUT']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// The append-only stock ledger.
inventoryRoutes.get('/movements', requirePermission('inventory:read'),
  validate({ query: movementsQuery }),
  ah(async (req, res) => {
    const { page, pageSize, ...filters } = req.query;
    const where = { businessId: req.businessId, ...filters };
    const [total, data] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          variant: { select: { id: true, sku: true, product: { select: { name: true } } } },
          device: { select: { id: true, imei1: true } },
        },
      }),
    ]);
    res.json({ data, page, pageSize, total });
  }));

// Manual stock correction with a mandatory reason (audited).
const adjustSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  delta: z.coerce.number().int().refine((v) => v !== 0, 'delta must be non-zero'),
  reason: z.string().min(3).max(300),
});

inventoryRoutes.post('/adjustments', requirePermission('inventory:adjust'),
  validate({ body: adjustSchema }),
  ah(async (req, res) => {
    const { warehouseId, variantId, delta, reason } = req.body;
    const [warehouse, variant] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: warehouseId, businessId: req.businessId } }),
      prisma.productVariant.findFirst({ where: { id: variantId, businessId: req.businessId } }),
    ]);
    if (!warehouse) throw ApiError.badRequest('Unknown warehouse');
    if (!variant) throw ApiError.badRequest('Unknown variant');
    if (variant.product && (await prisma.product.findUnique({ where: { id: variant.productId } }))?.type === 'PHONE') {
      throw ApiError.badRequest('Phones are unit-tracked — adjust via device operations, not quantities');
    }

    const result = await withTransaction(async (tx) => {
      await adjustOnHand(tx, {
        businessId: req.businessId, warehouseId, variantId, delta,
        type: 'ADJUSTMENT', note: reason, userId: req.user.id,
      });
      await writeAudit(tx, {
        businessId: req.businessId, userId: req.user.id, action: 'inventory.adjust',
        entityType: 'InventoryBalance', entityId: `${warehouseId}:${variantId}`,
        after: { delta, reason },
      });
      return tx.inventoryBalance.findUnique({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
    });
    res.status(201).json({ data: result });
  }));
