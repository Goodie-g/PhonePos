# Stoku Full-Stack Transformation — Progress Report

> Checkpoint file. Updated at the end of every stage so work can resume
> from the last verified point if the session is interrupted.

## Final stage status

| Stage | Status | Notes |
|---|---|---|
| 1. Inspect & plan | ✅ Done | See Stage 1 summary below |
| 2. Backend foundation (auth, tenancy, Prisma, errors) | ✅ Done | 6/6 tests |
| 3. Core inventory (products, IMEI, suppliers, purchases, warehouses) | ✅ Done | 12/12 tests |
| 4. Wholesale sales (customers, pricing, orders, invoices, payments) | ✅ Done | 18/18 tests |
| 5. Distribution (transfers, allocation, dispatch) | ✅ Done | 21/21 tests |
| 6. Reports, returns, seed, frontend, docs | ✅ Done | 25/25 tests; TS clean; web export built |
| 7. Verification | ✅ Done | see "Verified" list below |

## What was delivered (summary)

**Backend** (`server/` — Express 4 ESM, Prisma, PostgreSQL, zod, JWT):
- Auth (register business, login, rotating refresh tokens with reuse detection,
  logout, me) + 7-role RBAC permission map + tenant resolution middleware.
- Products/brands/categories/variants; IMEI devices with lifecycle states;
  suppliers; purchase orders with transactional partial receiving (accessory
  quantities and phone-per-IMEI, duplicate-IMEI 409s); warehouses; inventory
  balances + append-only stock ledger + audited manual adjustments; customers
  with statements; price lists with quantity tiers; sales orders with
  atomic reservation (accessories raw-SQL reserve; phones compare-and-set),
  partial fulfilment, cancellation; invoices with credit limits; payments with
  FOR UPDATE row lock, overpayment rejection and idempotency keys; transfers
  (dispatch → receive → partial → cancel-with-return); shipments (only
  fulfilled stock ships); returns with inspection-driven restock/quarantine;
  reports (dashboard, stock, outstanding, best-sellers) with SQL aggregation;
  audit trail; idempotency helper; consistent error handling.
- 25 Vitest/Supertest integration tests against a real PostgreSQL test DB.

**Frontend** (existing Expo app, API-driven):
- Data layer: `lib/api/*` (client with single-flight 401 refresh, session
  store, TZS formatting), `lib/session.tsx` (provider + auth gate),
  `hooks/api/*` (React Query hooks, idempotent mutations).
- UI: login, dashboard (live server metrics), catalogue list/detail/create
  (variants, inline add-variant), order builder + order lifecycle screen,
  customers + statement, invoice detail with idempotent payments, PO create +
  receiving screen (IMEI rows), transfers list/create/detail (dispatch/receive),
  devices (IMEI search + mark-available), reports (stock/outstanding/sellers),
  warehouses, team members (invite/roles), returns + inspection/refund.
- Old AsyncStorage screens removed; visual identity (`constants/design.ts`)
  and the existing UI kit preserved and reused.

**Infra & docs**: docker-compose.yml (optional), portable PostgreSQL in
`tools/` (gitignored), `.env.example` templates (no secrets), README rewrite,
seed script (2 businesses incl. tenant-isolation demo, 57 phones validated by
Luhn, 82 ledger movements, orders/invoices/payments/transfer), and 9 docs
(ARCHITECTURE, DATABASE, API, AUTHENTICATION, INVENTORY, SALES_AND_PAYMENTS,
SECURITY, LOCAL_SETUP, LEARNING_GUIDE).

## Verified (actually run)

- `npx vitest run` → **25/25 passed** (auth/rotation/isolation, catalog+SKU 409,
  receiving incl. IMEI dupes + over-receive, negative-stock guard, idempotent
  receive, full sales lifecycle, concurrent confirm → one winner, credit limit,
  payment idempotency, transfers conservation, shipment rules, returns flow,
  reports aggregates + tenant-isolated reports).
- `npx tsc --noEmit` → 0 errors (frontend clean).
- `npx expo export --platform web` → built all routes to `dist-web/`.
- Seed script run twice successfully (idempotent skip when data exists).
- API smoke-tested live: health, login, dashboard, devices, statements.
- Web-served export + on-device Expo Go runs are UNVERIFIED (no emulator here).

## Known limitations (honest list)

- Invoice per FULFILLED order only (no partial invoicing); COGS uses current
  cost prices (no cost snapshot on order lines); refund is bookkeeping-only.
- Mobile-money references recorded, not provider-verified (by design).
- Password reset designed but not wired (no SMTP in scope).
- Shipments don't restore devices if a delivered shipment is later disputed;
  product images kept as URL field only.

## Last verified checkpoint

All stages complete; tests green, TS green, web export green.
