import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { apiLimiter, authLimiter } from './middleware/rate-limit.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { productsRoutes } from './modules/products/products.routes.js';
import { warehousesRoutes } from './modules/warehouses/warehouses.routes.js';
import { suppliersRoutes } from './modules/suppliers/suppliers.routes.js';
import { purchasesRoutes } from './modules/purchases/purchases.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { devicesRoutes } from './modules/devices/devices.routes.js';
import { customersRoutes } from './modules/customers/customers.routes.js';
import { pricingRoutes } from './modules/pricing/pricing.routes.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { invoicingRoutes } from './modules/invoicing/invoicing.routes.js';
import { transfersRoutes } from './modules/transfers/transfers.routes.js';
import { shipmentsRoutes } from './modules/shipments/shipments.routes.js';
import { returnsRoutes } from './modules/returns/returns.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (curl, RN fetch has no Origin) and whitelisted origins.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: false, // bearer tokens, not cookies
    })
  );
  app.use(express.json({ limit: '1mb' }));
  if (!config.isProd) app.use(morgan('dev'));
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'stoku-api' }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/warehouses', warehousesRoutes);
  app.use('/api/suppliers', suppliersRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/price-lists', pricingRoutes);
  app.use('/api/orders', salesRoutes);
  app.use('/api', invoicingRoutes);
  app.use('/api/transfers', transfersRoutes);
  app.use('/api/shipments', shipmentsRoutes);
  app.use('/api/returns', returnsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/audit', auditRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
