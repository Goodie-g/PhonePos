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

## Deployment status (Nov 27, 2026)

**Live and verified:**
- Frontend: https://phone-pos.vercel.app (Expo web static export on Vercel,
  `EXPO_PUBLIC_API_URL` baked in at build time, deployed via Git auto-deploy).
- Backend: https://stoku-api.onrender.com (Render Docker service, auto-deploy on
  push, health at `/api/health`, CORS allow-list includes the frontend).
- Database: Neon free-tier Postgres, schema migrated, demo-seeded
  (2 businesses, 57 devices, 82 ledger movements, 3 orders).
- End-to-end verified in a browser: login → dashboard (TSh 4,277,500 revenue,
  2,000,000 cash, 2,277,500 outstanding, 40 available devices) → inventory
  catalogue. Tenant-isolation demo login: `baraka@kiligadgets.co.tz`.

**Deployment bugs found and fixed (all in code, all pushed):**
1. Port binding to 0 when Render's `PORT` is empty → robust parsing (d064cdb).
2. CORS middleware threw on unknown origins → 500s + process crash; now rejects
   by omitting headers, and the allow-list merges defaults with `CORS_ORIGINS`
   plus `*.vercel.app` previews of the demo project (3676616).
3. `trust proxy` unset → express-rate-limit mis-read client IPs behind Render.
4. Prisma 5s interactive-transaction default → all transactions now use a
   15s wait / 30s run budget (86fda06).
5. Seed/health-check race: app now listens BEFORE background-seeding an empty
   database (`SEED_ON_EMPTY_DB=false` to disable).
6. `prisma migrate deploy` advisory-lock timeout (P1002) on Neon: migrations now
   run against Neon's *direct* host (auto-derived by stripping `-pooler` from
   the hostname, or set `MIGRATION_URL`), with one retry (47cd29f/643ba6b).
7. Neon's pgbouncer host also breaks the APP's interactive transactions
   (`Transaction not found`) — `start.sh` derives the direct host for the app
   as well (462e57c).
8. Per-device query loops (receiving, fulfilment, transfers) did 2-4 round trips
   per handset (~140 queries to receive 35 phones) — replaced with batched
   `addUnits`/`removeUnits` in `services/stock.js` (~15 queries). Same
   invariants: conditional updates, append-only ledger, 25/25 tests pass.

**Honest caveats for the deployed demo:**
- Neon free compute + long network routes mean ~300ms per query; the boot seed
  takes minutes when it runs (only on a truly empty database). APIs work fine.
- Render free tier sleeps after ~15 min idle (first request can take ~50s).
- `server/prisma/reset.js` (`npm run db:reset`) empties tables without dropping
  the schema; then restart the API to reseed, or run `npm run seed`.
