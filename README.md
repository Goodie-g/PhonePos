# Stoku — Wholesale & Distribution Management

Full-stack business application for mobile-phone wholesalers and distributors:
catalogue with variants, IMEI-tracked handsets, purchasing/receiving, multi-warehouse
inventory with a stock ledger, business customers with price tiers and credit limits,
sales orders with reservation/fulfilment lifecycle, invoices & partial payments,
warehouse transfers, shipments, returns with inspection — one Express API on PostgreSQL.

```
Expo app (React Native: iOS/Android/web) ──HTTP──▶ Express API (server/) ──▶ PostgreSQL
```

Full documentation is in [`docs/`](docs): architecture, database design, API
reference, authentication, inventory rules, sales & payments, security, setup
and a learning guide.

## Quick start

```powershell
npm install                # Expo app + shared deps
cd server && npm install   # API deps
cd ..
```

1. **PostgreSQL** — easiest: `npm run db:docker` (Docker), otherwise see
   `docs/LOCAL_SETUP.md` (a portable copy under `tools/pgsql` is already used
   in this workspace).
2. **Configure** — `server/.env` from `server/.env.example`; root `.env` from
   `.env.example` (`EXPO_PUBLIC_API_URL`).
3. **Migrate + seed**:
   ```powershell
   npm run db:migrate
   npm run db:seed
   npm --prefix server run db 2>&1  # (or apply the test db migration; see docs)
   ```
   Correction: apply the test-db migration manually if you want tests:
   ```powershell
   $env:DATABASE_URL="postgresql://stoku:stoku@localhost:5433/stoku_test?schema=public"
   npx --prefix server prisma migrate deploy
   ```
4. **Run**:
   ```powershell
   npm run api    # terminal 1 — API on :4000
   npm run web    # terminal 2 — Expo (or `npm start` + Expo Go)
   ```
5. **Tests**: `npm run test:api` (25 integration tests against `stoku_test`).
   The first test run needs the test database migrated once (step 3, second
   block).

### Demo logins (seeded, password `Stoku2026!`)

| User | Role | Business |
|---|---|---|
| neema@uhuruphones.co.tz | OWNER | Uhuru Phones & Accessories (full demo, 2 warehouses) |
| sales@uhuruphones.co.tz | SALES_MANAGER | Uhuru Phones & Accessories |
| store@uhuruphones.co.tz | WAREHOUSE_STAFF | Uhuru Phones & Accessories |
| baraka@kiligadgets.co.tz | OWNER | Kili Gadgets (tenant-isolation demo) |

All data is fictional (invalid-free Luhn IMEIs, fake payment references); no
real customer or payment data.

## Status highlights

- Backend: 25/25 automated tests pass — see Stage summary in `PROGRESS.md`.
- The API computes ALL money and stock changes server-side (transactions,
  row locking, idempotency keys, per-business audit log).


In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
