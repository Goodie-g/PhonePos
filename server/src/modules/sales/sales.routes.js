import { Router } from 'express';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { idempotent } from '../../services/idempotency.js';
import { createOrderSchema, fulfilSchema, orderListQuery } from './sales.schemas.js';
import * as svc from './sales.service.js';

export const salesRoutes = Router();
salesRoutes.use(authenticate, resolveBusiness);

salesRoutes.get('/', requirePermission('orders:read'),
  validate({ query: orderListQuery }),
  ah(async (req, res) => {
    res.json(await svc.listOrders({ businessId: req.businessId, query: req.query }));
  }));

salesRoutes.get('/:id', requirePermission('orders:read'),
  ah(async (req, res) => {
    res.json({ data: await svc.getOrder({ businessId: req.businessId, id: req.params.id }) });
  }));

// Creates a DRAFT order. Prices/discounts/totals are computed server-side.
salesRoutes.post('/', requirePermission('orders:create'),
  validate({ body: createOrderSchema }),
  ah(async (req, res) => {
    const { replayed, result, statusCode } = await idempotent(req, 'orders.create', async () => ({
      body: { data: await svc.createOrder({ businessId: req.businessId, userId: req.user.id, body: req.body }) },
      statusCode: 201,
    }));
    res.status(statusCode).json(result);
  }));

salesRoutes.post('/:id/submit', requirePermission('orders:create'),
  ah(async (req, res) => {
    res.json({ data: await svc.submitOrder({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));

salesRoutes.post('/:id/confirm', requirePermission('orders:manage'),
  ah(async (req, res) => {
    res.json({ data: await svc.confirmOrder({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));

salesRoutes.post('/:id/fulfil', requirePermission('orders:manage'),
  validate({ body: fulfilSchema }),
  ah(async (req, res) => {
    res.json({ data: await svc.fulfilOrder({ businessId: req.businessId, userId: req.user.id, id: req.params.id, body: req.body }) });
  }));

salesRoutes.post('/:id/cancel', requirePermission('orders:manage'),
  ah(async (req, res) => {
    res.json({ data: await svc.cancelOrder({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));
