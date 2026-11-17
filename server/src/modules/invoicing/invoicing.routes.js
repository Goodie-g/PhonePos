import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { createInvoiceSchema, recordPaymentSchema, invoiceListQuery } from './invoicing.schemas.js';
import * as svc from './invoicing.service.js';

export const invoicingRoutes = Router();
invoicingRoutes.use(authenticate, resolveBusiness);

// ── Invoices ─────────────────────────────────────────────────────────

invoicingRoutes.get('/invoices', requirePermission('invoices:read'),
  validate({ query: invoiceListQuery }),
  ah(async (req, res) => {
    res.json(await svc.listInvoices({ businessId: req.businessId, query: req.query }));
  }));

invoicingRoutes.get('/invoices/:id', requirePermission('invoices:read'),
  ah(async (req, res) => {
    res.json({ data: await svc.getInvoice({ businessId: req.businessId, id: req.params.id }) });
  }));

invoicingRoutes.post('/invoices', requirePermission('invoices:create'),
  validate({ body: createInvoiceSchema }),
  ah(async (req, res) => {
    const data = await svc.createInvoice({
      businessId: req.businessId, userId: req.user.id, salesOrderId: req.body.salesOrderId,
    });
    res.status(201).json({ data });
  }));

invoicingRoutes.post('/invoices/:id/void', requirePermission('invoices:create'),
  ah(async (req, res) => {
    res.json({ data: await svc.voidInvoice({ businessId: req.businessId, userId: req.user.id, id: req.params.id }) });
  }));

// ── Payments ─────────────────────────────────────────────────────────

invoicingRoutes.get('/payments', requirePermission('payments:read'),
  validate({ query: z.object({
    invoiceId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }) }),
  ah(async (req, res) => {
    res.json(await svc.listPayments({ businessId: req.businessId, query: req.query }));
  }));

// Idempotent by design: same Idempotency-Key -> same payment, no duplicates.
invoicingRoutes.post('/invoices/:id/payments', requirePermission('payments:record'),
  validate({ body: recordPaymentSchema }),
  ah(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { payment, invoice, replayed } = await svc.recordPayment({
      businessId: req.businessId, userId: req.user.id, invoiceId: req.params.id,
      body: req.body, idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    });
    res.status(replayed ? 200 : 201).json({ data: { payment, invoice, replayed } });
  }));
