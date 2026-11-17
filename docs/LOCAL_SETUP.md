# Stoku — Local Setup (Windows & general)

## What you need

1. **Node.js 18+** (built with Node 24).
2. **PostgreSQL** — either:
   - `tools/pgsql` portable copy (already set up in THIS machine's copy for
     development; see below), or
   - Docker (`docker compose up -d postgres`), or
   - a system PostgreSQL service.
3. Expo Go app (for running on a phone) or just the web browser.

## One-time setup

```bash
# 1) install everything (root = Expo app, server/ = API)
npm install
cd server && npm install && cd ..
```

### PostgreSQL options

**Docker (recommended for reproducibility)**
```bash
docker compose up -d postgres   # created with docker-compose.yml in the repo root
```

(**Portable copy — used in this workspace**)
```powershell
tools\pgsql\bin\initdb.exe -D tools\pgsql\data -U postgres -A trust -E UTF8 --locale=C
tools\pgsql\bin\pg_ctl.exe -D tools\pgsql\data -o "-p 5433" start
tools\pgsql\bin\psql.exe -h localhost -p 5433 -U postgres -c "CREATE USER stoku WITH PASSWORD 'stoku' CREATEDB;" -c "CREATE DATABASE stoku OWNER stoku;" -c "CREATE DATABASE stoku_test OWNER stoku;"
```
Note: the daemon keeps running after `pg_ctl start`; to stop:
`tools\pgsql\bin\pg_ctl.exe -D tools\pgsql\data stop`.

Port **5433** is used on purpose (5432 is often taken on dev machines).

### 2) Environment files

- `server/.env` — copy `server/.env.example`; the shipped dev defaults point at
  `postgresql://stoku:stoku@localhost:5433/stoku?schema=public`.
  **Generate a real JWT_SECRET** (`openssl rand -hex 48` / `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Root `.env` for the Expo app: `EXPO_PUBLIC_API_URL=http://localhost:4000`
  (Android emulator: `http://10.0.2.2:4000`; a phone on LAN:
  `http://<your-ip>:4000`).

### 3) Migrate + seed

```bash
cd server
npx prisma migrate dev        # creates/updates schema on `stoku` (DATABASE_URL)
TEST_DATABASE_URL="postgresql://stoku:stoku@localhost:5433/stoku_test?schema=public" npx prisma migrate deploy
npm run seed                  # 2 businesses, devices, orders, payments...
```

### 4) Run

```bash
# terminal 1 (API)
cd server && npm run dev        # http://localhost:4000 (GET /api/health)

# terminal 2 (Expo app)
npm run web                     # —or—  npm start + Expo Go on your phone
```

Log in with the seeded demo accounts (password for all: `Stoku2026!`,
change nothing to run the demo):
- `neema@uhuruphones.co.tz` — owner, Uhuru Phones (rich data)
- `sales@uhuruphones.co.tz` — sales manager
- `store@uhuruphones.co.tz` — warehouse staff
- `baraka@kiligadgets.co.tz` — owner of the second business (tenant isolation demo)

### 5) Tests

```bash
cd server
npm test        # integrations against stoku_test (25 tests, all real SQL)
```
The tests truncate `stoku_test` between cases — safe to re-run anytime.

### 6) Production build

```bash
cd server && npm start                      # plain node
npx expo export --platform web              # static web bundle (dist-web/)
```
For mobile store builds: `eas build` (requires expo account + config).
The API in production should run behind HTTPS (reverse proxy) with
`NODE_ENV=production`, real `JWT_SECRET`, and pinned `CORS_ORIGINS`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot reach the server` toast in app | API not running; check `EXPO_PUBLIC_API_URL` |
| `P1010 user denied` from Prisma | `stoku` role/db not created — rerun CREATE USER/DATABASE step |
| `EADDRINUSE :5433` | PG already running — that's fine |
| `EADDRINUSE :4000` | API already running — fine |
| Login 401 persists | tokens rotate; refresh flow handles it — trying again with stored creds fails | FIX: sign in again |
| Tests fail first run | run `prisma migrate deploy` with TEST_DATABASE_URL first |
