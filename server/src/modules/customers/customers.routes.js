import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, withTransaction } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { nextDocNumber } from '../../utils/doc-number.js';

export const customersRoutes = Router();
customersRoutes.use(authenticate, resolveBusiness);

const customerSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().max(300).optional(),
  creditLimit: z.coerce.number().nonnegative().default(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  priceListId: z.string().uuid().optional(),
});
const customerUpdateSchema = customerSchema.partial().extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']).optional(),
});

const listQuery = z.object({
  search: z.string().max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

customersRoutes.get('/', requirePermission('customers:read'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const { page, pageSize, search, status } = req.query;
    const where = {
      businessId: req.businessId,
      ...(status && { status }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const [total, data] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: { priceList: { select: { id: true, name: true } } },
      }),
    ]);
    res.json({ data, page, pageSize, total });
  }));

customersRoutes.post('/', requirePermission('customers:manage'),
  validate({ body: customerSchema }),
  ah(async (req, res) => {
    if (req.body.priceListId) {
      const pl = await prisma.priceList.findFirst({
        where: { id: req.body.priceListId, businessId: req.businessId },
      });
      if (!pl) throw ApiError.badRequest('Unknown price list');
    }
    const data = await withTransaction(async (tx) => {
      const code = await nextDocNumber(tx, req.businessId, 'customer');
      return tx.customer.create({ data: { ...req.body, code, businessId: req.businessId } });
    });
    res.status(201).json({ data });
  }));

customersRoutes.get('/:id', requirePermission('customers:read'), ah(async (req, res) => {
  const data = await prisma.customer.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { priceList: true },
  });
  if (!data) throw ApiError.notFound('Customer not found');
  res.json({ data });
}));

customersRoutes.patch('/:id', requirePermission('customers:manage'),
  validate({ body: customerUpdateSchema }),
  ah(async (req, res) => {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!existing) throw ApiError.notFound('Customer not found');
    const data = await prisma.customer.update({ where: { id: existing.id }, data: req.body });
    res.json({ data });
  }));

// Account statement: every invoice with its payments and outstanding amount.
customersRoutes.get('/:id/statement', requirePermission('customers:read'),
  ah(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!customer) throw ApiError.notFound('Customer not found');
    const invoices = await prisma.invoice.findMany({
      where: { businessId: req.businessId, customerId: customer.id, status: { not: 'VOID' } },
      include: { payments: { orderBy: { receivedAt: 'asc' } } },
      orderBy: { issuedAt: 'desc' },
    });
    const dec = (v) => new Prisma.Decimal(v);
    const lines = invoices.map((inv) => {
      const outstanding = dec(inv.total).minus(inv.amountPaid);
      return {
        invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status,
        issuedAt: inv.issuedAt, dueAt: inv.dueAt, total: inv.total,
        amountPaid: inv.amountPaid, outstanding,
        overdue: inv.dueAt ? inv.dueAt < new Date() && outstanding.gt(0) : false,
        payments: inv.payments,
      };
    });
    const totalOutstanding = lines.reduce((s, l) => s.plus(l.outstanding), dec(0));
    res.json({ data: { customer, lines, totalOutstanding, creditLimit: customer.creditLimit } });
  }));
