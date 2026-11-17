import { Router } from 'express';
import { prisma } from '../../db.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import {
  brandSchema, categorySchema, productSchema, productUpdateSchema,
  variantSchema, variantUpdateSchema, productListQuery,
} from './products.schemas.js';

export const productsRoutes = Router();
productsRoutes.use(authenticate, resolveBusiness);

// ── Brands & categories ──────────────────────────────────────────────

productsRoutes.get('/brands', ah(async (req, res) => {
  const data = await prisma.brand.findMany({
    where: { businessId: req.businessId }, orderBy: { name: 'asc' },
  });
  res.json({ data });
}));

productsRoutes.post('/brands', requirePermission('products:manage'),
  validate({ body: brandSchema }), ah(async (req, res) => {
    const data = await prisma.brand.create({
      data: { businessId: req.businessId, name: req.body.name.trim() },
    });
    res.status(201).json({ data });
  }));

productsRoutes.get('/categories', ah(async (req, res) => {
  const data = await prisma.category.findMany({
    where: { businessId: req.businessId }, orderBy: { name: 'asc' },
  });
  res.json({ data });
}));

productsRoutes.post('/categories', requirePermission('products:manage'),
  validate({ body: categorySchema }), ah(async (req, res) => {
    const data = await prisma.category.create({
      data: { businessId: req.businessId, name: req.body.name.trim() },
    });
    res.status(201).json({ data });
  }));

// ── Product models ───────────────────────────────────────────────────

productsRoutes.get(
  '/',
  requirePermission('products:read'),
  validate({ query: productListQuery }),
  ah(async (req, res) => {
    const { page, pageSize, search, type, status, brandId, categoryId, sort } = req.query;
    const where = {
      businessId: req.businessId,
      ...(type && { type }),
      ...(status && { status }),
      ...(brandId && { brandId }),
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };
    const orderBy =
      sort === 'newest' ? { createdAt: 'desc' }
      : sort === 'oldest' ? { createdAt: 'asc' }
      : { name: sort === '-name' ? 'desc' : 'asc' };

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
        include: { brand: true, category: true, variants: { orderBy: { sku: 'asc' } } },
      }),
    ]);
    res.json({ data, page, pageSize, total });
  })
);

productsRoutes.post('/', requirePermission('products:manage'),
  validate({ body: productSchema }), ah(async (req, res) => {
    // Verify the brand (and category) belong to THIS business.
    const brand = await prisma.brand.findFirst({
      where: { id: req.body.brandId, businessId: req.businessId },
    });
    if (!brand) throw ApiError.badRequest('Unknown brand for this business');
    if (req.body.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: req.body.categoryId, businessId: req.businessId },
      });
      if (!category) throw ApiError.badRequest('Unknown category for this business');
    }
    const data = await prisma.product.create({
      data: { ...req.body, businessId: req.businessId },
      include: { brand: true, category: true, variants: true },
    });
    res.status(201).json({ data });
  }));

productsRoutes.get('/:id', requirePermission('products:read'), ah(async (req, res) => {
  const data = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { brand: true, category: true, variants: { orderBy: { sku: 'asc' } } },
  });
  if (!data) throw ApiError.notFound('Product not found');
  res.json({ data });
}));

productsRoutes.patch('/:id', requirePermission('products:manage'),
  validate({ body: productUpdateSchema }), ah(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!existing) throw ApiError.notFound('Product not found');
    const data = await prisma.product.update({
      where: { id: existing.id }, data: req.body,
      include: { brand: true, category: true, variants: true },
    });
    res.json({ data });
  }));

// ── Variants ─────────────────────────────────────────────────────────

productsRoutes.post('/:id/variants', requirePermission('products:manage'),
  validate({ body: variantSchema }), ah(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
    });
    if (!product) throw ApiError.notFound('Product not found');
    const data = await prisma.productVariant.create({
      data: { ...req.body, productId: product.id, businessId: req.businessId },
    });
    res.status(201).json({ data });
  }));

productsRoutes.patch('/variants/:variantId', requirePermission('products:manage'),
  validate({ body: variantUpdateSchema }), ah(async (req, res) => {
    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, businessId: req.businessId },
    });
    if (!existing) throw ApiError.notFound('Variant not found');
    const data = await prisma.productVariant.update({
      where: { id: existing.id }, data: req.body,
    });
    res.json({ data });
  }));
