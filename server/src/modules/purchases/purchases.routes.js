import { Router } from 'express';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { idempotent } from '../../services/idempotency.js';
import { createPOSchema, receiveSchema, poListQuery } from './purchases.schemas.js';
import * as svc from './purchases.service.js';

export const purchasesRoutes = Router();
purchasesRoutes.use(authenticate, resolveBusiness);

purchasesRoutes.get('/', requirePermission('purchases:read'),
  validate({ query: poListQuery }),
  ah(async (req, res) => {
    res.json(await svc.listPurchaseOrders({ businessId: req.businessId, query: req.query }));
  }));

purchasesRoutes.get('/:id', requirePermission('purchases:read'),
  ah(async (req, res) => {
    res.json({ data: await svc.getPurchaseOrder({ businessId: req.businessId, id: req.params.id }) });
  }));

purchasesRoutes.post('/', requirePermission('purchases:manage'),
  validate({ body: createPOSchema }),
  ah(async (req, res) => {
    const data = await svc.createPurchaseOrder({
      businessId: req.businessId, userId: req.user.id, body: req.body,
    });
    res.status(201).json({ data });
  }));

purchasesRoutes.post('/:id/submit', requirePermission('purchases:manage'),
  ah(async (req, res) => {
    res.json({ data: await svc.transitionPO({ businessId: req.businessId, userId: req.user.id, id: req.params.id, action: 'submit' }) });
  }));

purchasesRoutes.post('/:id/cancel', requirePermission('purchases:manage'),
  ah(async (req, res) => {
    res.json({ data: await svc.transitionPO({ businessId: req.businessId, userId: req.user.id, id: req.params.id, action: 'cancel' }) });
  }));

// The stock-changing endpoint. Accepts Idempotency-Key for safe retries.
purchasesRoutes.post('/:id/receive', requirePermission('purchases:receive'),
  validate({ body: receiveSchema }),
  ah(async (req, res) => {
    const { replayed, result, statusCode } = await idempotent(req, 'purchases.receive', async () => {
      const data = await svc.receiveGoods({
        businessId: req.businessId, userId: req.user.id, id: req.params.id, body: req.body,
      });
      return { body: { data }, statusCode: 201 };
    });
    res.status(replayed ? statusCode ?? 201 : statusCode ?? 201).json(result);
  }));
