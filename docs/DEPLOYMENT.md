# Stoku — Deployment Guide (Portfolio Demo)

This document turns the local app into a publicly hosted, showcase-ready demo.
It assumes the backend (Express + Prisma + Postgres) and the Expo web
frontend are deployed separately.

## Recommended stack (free/cheap, low friction)

| Layer | Service | Why |
|---|---|---|
| Frontend (static web) | **Vercel** or **Netlify** | free tier, auto HTTPS, custom domain, Git-based deploys |
| Backend (Node) | **Render** (Web Service) or **Railway** or **Fly.io** | runs a long-running Express process; free/low cost |
| Database | **Neon** (serverless Postgres) or **Supabase** | free tier, managed, HTTPS, backups |

Pick one provider per row; the steps below use **Render + Neon** as the
concrete example because both have generous free tiers and a one-click
Postgres. Swap names if you prefer.

## Pre-deployment checklist (do these first)

1. **Fix the Expo version drift** — already done (`expo ~57`, `expo-router ~57`).
2. **Generate a real JWT secret**: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. **Decide the public URLs**:
   - Frontend: `https://stoku.yourdomain.com` (or `*.vercel.app`)
   - Backend:  `https://stoku-api.onrender.com`
4. **Confirm `.env` is NOT committed** (`.gitignore` covers it). Only
   `.env.example` files should be in git.
5. **Make sure `npm run typecheck` and `npm run test:api` pass locally** —
   they do (25/25).

## Step 1 — Database (Neon)

1. Create a Neon project → get the connection string (it has `?sslmode=require`).
2. In the Neon SQL editor (or psql), create a second database for nothing —
   one DB is enough; tests run locally only.
3. Save the connection string as `DATABASE_URL` for the backend.

## Step 2 — Backend (Render)

A `server/Dockerfile` is included. On Render:

1. **New → Web Service** → connect your GitHub repo.
2. **Root directory**: `server` (so Render builds from there).
3. **Environment**: Docker (uses `server/Dockerfile`), or Node with:
   - Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
   - Start command: `node src/index.js`
4. **Environment variables** (set in the Render dashboard — never in git):
   - `DATABASE_URL` = Neon connection string
   - `JWT_SECRET` = the long random string from step 1.2
   - `JWT_ACCESS_TTL` = `15m`
   - `REFRESH_TOKEN_TTL_DAYS` = `30`
   - `PORT` = (Render sets this automatically; leave unset or `10000`)
   - `CORS_ORIGINS` = your frontend URL, e.g. `https://stoku.vercel.app`
   - `BCRYPT_ROUNDS` = `10`
   - `NODE_ENV` = `production`
5. **Health check path**: `/api/health`.
6. Deploy. Watch the build log — `prisma migrate deploy` runs on every deploy,
   so schema changes ship automatically.

### Seed the demo data (once, after first deploy)

Render → Shell (or run locally pointed at the prod DB):
```bash
cd server
DATABASE_URL="<neon url>" npm run seed
```
This creates the two demo businesses + logins + IMEI stock + orders. Re-running
is a no-op (seed skips when businesses exist).

### Important: free-tier sleep

Render's free web service sleeps after 15 min of inactivity; the first
request after sleep takes ~30 s. For a portfolio demo that's usually fine —
mention it on the page, or upgrade to the $7/mo "Starter" plan for always-on.

## Step 3 — Frontend (Vercel)

Expo web is a static export. The API URL is baked in at build time via
`EXPO_PUBLIC_API_URL`, so you must set it **before** building.

1. **Vercel → New Project** → import the repo.
2. **Framework preset**: Other (or "Expo" if listed).
3. **Build command**: `npm install && npx expo export --platform web --output-dir dist-web`
4. **Output directory**: `dist-web`
5. **Environment variables** (Vercel → Settings → Environment Variables):
   - `EXPO_PUBLIC_API_URL` = `https://stoku-api.onrender.com` (your Render URL)
6. Deploy. Vercel gives you `https://stoku.vercel.app`.

### Custom domain (optional, ~$10/yr)

Point `stoku.yourdomain.com` at Vercel and update `CORS_ORIGINS` on Render to
match. Free HTTPS is automatic.

## Step 4 — Verify the deployed demo

1. Open the frontend URL → log in with `neema@uhuruphones.co.tz` / `Stoku2026!`.
2. Check the dashboard loads real numbers (not zeros) — confirms DB + seed.
3. Create a test order end-to-end; confirm stock decreases.
4. Open DevTools → Network tab: every request should be HTTPS to your API
   origin, with `Authorization` and `x-business-id` headers.
5. Test tenant isolation live: log in as `baraka@kiligadgets.co.tz` and
   confirm Uhuru's data is invisible.

## Step 5 — Put it on your portfolio

Suggested portfolio write-up (honest, specific, shows depth):

> **Stoku — Wholesale & Distribution Management System**
> Full-stack business app for mobile-phone wholesalers. React Native (Expo)
> frontend + Express/Prisma/PostgreSQL backend with multi-tenant isolation,
> role-based access, IMEI-tracked handsets, atomic stock reservations, a
> stock ledger, invoices with partial payments, warehouse transfers, and
> server-aggregated reporting. 25 integration tests covering concurrency
> (two buyers racing for the last device), tenant isolation, idempotency.
> [Live demo] [Source code]

Include:
- A 60-second screen recording of the order → fulfil → invoice → payment flow.
- The "two concurrent buyers" test as a talking point (shows you understand
  real concurrency, not just CRUD).
- A link to `docs/LEARNING_GUIDE.md` if you want to show how you think.

## Ongoing maintenance

- **Migrations**: `prisma migrate deploy` runs on every Render deploy. Add a
  migration locally with `npm run db:migrate`, commit, push — Render applies it.
- **Secrets rotation**: change `JWT_SECRET` → all sessions invalidated (users
  re-login). Rotate periodically.
- **Backups**: Neon keeps point-in-time recovery on paid plans; on free tier,
  export with `pg_dump` weekly.
- **Monitoring**: Render logs + Neon metrics. Add Sentry (frontend + backend)
  for real error tracking — env vars only, no code changes needed.

## Files added for deployment

- `server/Dockerfile` — production image (multi-stage, runs migrations on start).
- `docker-compose.yml` — local Postgres option.
- `.env.example` (root) and `server/.env.example` — sanitized templates.
- `docs/DEPLOYMENT.md` — this document.
