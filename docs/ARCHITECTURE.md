# Stoku Architecture

Stoku is a full-stack wholesale & distribution management system for mobile-phone
businesses. This document explains the system overview and the request flow.

## System overview

```
┌────────────────────────────┐        ┌─────────────────────────────┐
│  Expo app (React Native)   │  HTTPS │  Express API (Node, ESM)    │
│  web + iOS + Android       │ ─────► │  zod validation, JWT auth   │
│  TanStack Query + RHF      │  JSON  │  RBAC + tenant isolation    │
│  (screens in app/)         │ ◄───── │  business services (txns)   │
└────────────────────────────┘        │  Prisma ORM                 │
                                      └────────────┬────────────────┘
                                                   │ SQL
                                              ┌────▼────┐
                                              │ Postgres│
                                              └─────────┘
```

**One rule above all:** the database is the single source of truth. The React
app never writes business data locally (AsyncStorage only holds auth tokens
and the selected business). Every business change goes through the API, which
validates input, checks permissions, computes money with decimals, and writes
every stock/finalcial change inside a transaction with an audit entry.

## Layers (backend)

```
server/src/
  index.js            boots the HTTP server
  app.js              middleware wiring & route mounting
  config.js           env validation (fails fast)
  db.js               single PrismaClient
  middleware/
    authenticate.js   verifies Bearer JWT -> req.user
    tenant.js         resolves x-business-id membership -> req.businessId,
                      requirePermission() check
    validate.js       zod parsing of body/query/params
    error-handler.js  ApiError/Prisma/Zod -> consistent { error: {...} }
    rate-limit.js     strict limiter for auth routes, loose for the rest
  modules/<area>/
    *.schemas.js      zod schemas (validation lives here, not in services)
    *.service.js      business logic + transactions (the heart)
    *.routes.js       thin HTTP handlers: parse -> call service -> respond
  services/
    stock.js          the ONLY code that touches balances + stock ledger
    idempotency.js    Idempotency-Key protection for POSTs
  utils/              ApiError, doc numbers, IMEI/Luhn, audit writer
```

Request flow for `POST /api/orders/:id/confirm`:

1. `authenticate` — decode & verify the access token, load the user.
2. `resolveBusiness` — read `x-business-id`, verify membership → `req.membership`.
3. `requirePermission('orders:manage')` — check the role's permission grants.
4. `validate` — zod (here: params only, no body).
5. Service `confirmOrder`:
   - load the order **scoped to req.businessId** (tenant isolation),
   - check the state machine (SUBMITTED only),
   - in **one transaction** with Serializable isolation:
     raw-SQL conditional reserve for accessories, compare-and-set device claims
     for phones, audit row.
6. Route returns the updated order; on any business-rule failure the service
   throws ApiError the error handler converts to a 4xx response.

## Frontend data flow

- `lib/api/session.ts` — tokens + selected business outside React (readable by
  the fetch wrapper).
- `lib/api/client.ts` — `apiFetch()` adds Authorization + x-business-id,
  transparently refreshes on 401 (single-flight), normalizes errors.
- `hooks/api/*` — TanStack Query hooks. Lists use query params (the server
  filters/paginates); mutations invalidate related queries.
- `lib/session.tsx` — SessionProvider: login/logout/business switch/auth gate.
- Screens live in `app/` (expo-router): tabs for Dashboard/Inventory/Orders/More,
  stack screens for details.

## Modules → where to look

| Module | Frontend | API routes | Validation | Service | Tests |
|---|---|---|---|---|---|
| Auth & tenancy | `app/login.tsx`, `lib/session.tsx` | `modules/auth/auth.routes.js` | `auth.schemas.js` | `auth.service.js` | `tests/auth.test.js` |
| Users & roles | `app/members.tsx` | `modules/users/*` | `users.schemas.js` | in routes | (auth.test covers roles partially) |
| Catalogue | `app/(tabs)/inventory.tsx`, `app/product/*` | `modules/products/*` | `products.schemas.js` | in routes | `tests/inventory.test.js` |
| Devices (IMEI) | `app/devices.tsx` | `modules/devices/*` | in routes + `utils/imei.js` | — | `tests/inventory.test.js` |
| Suppliers | (via purchases) | `modules/suppliers/*` | inline zod | — | — |
| Purchasing | `app/purchase/*` | `modules/purchases/*` | `purchases.schemas.js` | `purchases.service.js` | `tests/inventory.test.js` |
| Inventory | `app/reports.tsx` (stock) | `modules/inventory/*` | inline zod | `services/stock.js` | `tests/inventory.test.js` |
| Transfers | `app/transfer/*` | `modules/transfers/*` | in routes file | `transfers.service.js` | `tests/transfers.test.js` |
| Customers | `app/customer/*` | `modules/customers/*` | inline zod | — | `tests/sales.test.js` |
| Pricing | (tiers seeded) | `modules/pricing/*` | inline zod | `sales.service.resolveUnitPrice` | `tests/sales.test.js` |
| Sales orders | `app/orders.tsx`, `app/order/*` | `modules/sales/*` | `sales.schemas.js` | `sales.service.js` | `tests/sales.test.js` |
| Invoices & payments | `app/invoices.tsx`, `app/invoice/*` | `modules/invoicing/*` | `invoicing.schemas.js` | `invoicing.service.js` | `tests/sales.test.js` |
| Returns | `app/returns.tsx`, `app/return/*` | `modules/returns/*` | inline zod | in routes | `tests/returns-reports.test.js` |
| Shipments | (via order detail flows) | `modules/shipments/*` | inline zod | in routes | `tests/transfers.test.js` |
| Reports | `app/reports.tsx`, dashboard | `modules/reports/*` | inline zod | SQL aggregation | `tests/returns-reports.test.js` |
| Audit | — | `modules/audit/*` | inline zod | `utils/audit.js` | — (write path exercised everywhere) |
