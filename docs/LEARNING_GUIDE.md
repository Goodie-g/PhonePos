# Stoku Learning Guide

Recommended study order — each step builds on the previous one.

1. **Start with the errors contract** — `server/src/utils/api-error.js` +
   `middleware/error-handler.js`. Every endpoint answers with
   `{ error: { code, message } }`. Ask: why do clients switch on `code`
   rather than parsing messages?

2. **Authentication** — `modules/auth/auth.service.js`. Understand:
   bcrypt, why the refresh token is stored as a hash, what "rotation" means,
   and why reuse detection revokes everything. Then trace one request through
   `middleware/authenticate.js` → `middleware/tenant.js`.

3. **The request pipeline** — `app.js`: helmet → CORS → JSON → morgan →
   rate limit → routes → notFound → error handler. Middleware = functions
   that run in order for every request.

4. **Database modelling** — `docs/DATABASE.md` + `prisma/schema.prisma`.
   Focus: Product/Variant/Device three-level model; Decimal money;
   `@@unique` constraints vs checks in services.

5. **Transactions & concurrency** — `services/stock.js` + the tests
   `tests/sales.test.js > two concurrent confirms cannot both claim the last
   device`. Learn compare-and-set updates, Serializable isolation, and why the
   UI can never be trusted for stock checks.

6. **Receiving flow** — `purchases.service.js receiveGoods`. One transaction:
   PO validation → devices with unique IMEIs → balances + ledger → receipts →
   status recompute → audit.

7. **Sales lifecycle** — `sales.service.js` reserve/fulfil + `invoicing`
   credit-limit and FOR UPDATE payment locking — then `docs/SALES_AND_PAYMENTS.md`
   for the metric definitions & their honest limitations.

8. **Frontend data layer** — `lib/api/client.ts` (single-flight refresh is the
   interesting bit) → `lib/session.tsx` → the TanStack Query hooks in
   `hooks/api/*`: cache keys, invalidation, mutation retries.

9. **Reports** — `modules/reports/reports.routes.js`: how SQL aggregation
   (groupBy/aggregate) replaces "load everything into the browser".

10. **Extend it** — good first exercises: add password reset (docs/
    AUTHENTICATION.md sketch); add multi-currency columns; snapshot COGS on
    order items; add per-user or per-device audit filters in the UI.

Concepts to look up as they appear: Express middleware, async/await & the
event loop, foreign keys & unique constraints, DB transactions & isolation
levels, JWT vs session auth, Prisma client & `$transaction`, React Query
staleTime/invalidation, react-hook-form + zod resolvers, idempotency keys,
`SELECT ... FOR UPDATE` row locking, Luhn algorithm (IMEI).
