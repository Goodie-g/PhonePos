import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import * as svc from './transfers.service.js';

export const transfersRoutes = Router();
transfersRoutes.use(authenticate, resolveBusiness);

const createSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
  })).default([]),
  deviceIds: z.array(z.string().uuid()).max(500).default([]),
}).refine((v) => v.items.length + v.deviceIds.length > 0, { message: 'Transfer needs items and/or devices' });

const receiveSchema = z.object({
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
  })).default([]),
  deviceIds: z.array(z.string().uuid()).max(500).default([]),
}).refine((v) => v.items.length + v.deviceIds.length > 0, { message: 'Nothing to receive' });

const listQuery = z.object({
  status: z.enum(['DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

transfersRoutes.get('/', requirePermission('transfers:read'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    res.json(await svc.listTransfers({ businessId: req.businessId, query: req.query }));
  }));

transfersRoutes.get('/:id', requirePermission('transfers:read'),
  ah(async (req, res) => {
    res.json({ data: await svc.getTransfer({ businessId: req.businessId, id: req.params.id }) });
  }));

transfersRoutes.post('/', requirePermission('transfers:manage'),
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const data = await svc.createTransfer({ businessId: req.businessId, userId: req.user.id, body: req.body });
    res.status(201).json({ data });
  }));

transfersRoutes.post('/:id/dispatch', requirePermission('transfers:dispatch'),
  ah(async (req, res) => {
    res.json({ data: await svc.dispatchTransfer({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));

transfersRoutes.post('/:id/receive', requirePermission('transfers:receive'),
  validate({ body: receiveSchema }),
  ah(async (req, res) => {
    res.json({ data: await svc.receiveTransfer({ businessId: req.businessId, userId: req.user.id, id: req.params.id, body: req.body }) });
  }));

transfersRoutes.post('/:id/cancel', requirePermission('transfers:manage'),
  ah(async (req, res) => {
    res.json({ data: await svc.cancelTransfer({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));
