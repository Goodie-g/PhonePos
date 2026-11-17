# Stoku Authentication & Permissions

## Strategy: short-lived access JWT + rotating refresh token

| Token | Lifetime | Storage (client) | Storage (server) |
|---|---|---|---|
| Access token | 15 min JWT (HS256) | memory/AsyncStorage | nothing (stateless verify) |
| Refresh token | 30 days, random 64-char string | AsyncStorage | SHA-256 **hash only** + expiry |

Chosen trade-offs (see also docs/SECURITY.md):

- **JWT access token** keeps every API request cheap: no DB lookup to verify,
  easy to use from React Native *and* the web (this is a bearer header, not a
  cookie). But JWTs cannot be individually revoked — which is why the lifetime
  is only 15 minutes and every privilege change happens on the NEXT token anyway
  (permissions are re-checked per request from the DB through `x-business-id`,
  never from the JWT).
- **Opaque rotating refresh tokens** stored hashed give real revocation:
  logout revokes; rotation means a token works once. **Reuse of an already-rotated
  token is treated as theft** — the auth service revokes ALL of that user's
  sessions immediately (`tests/auth.test.js` proves this).
- **Why not cookie sessions?** They would work on web but are awkward across
  React Native fetch/interceptors; the mixed mobile+web client pushed us to
  bearer tokens. For a pure web app, httpOnly cookies + CSRF tokens would be
  marginally safer (immune to token theft from JS) — documented trade-off.
- Password hashing uses **bcrypt** (cost 10; 4 in tests for speed).

## Roles & permissions

Seven roles: OWNER, ADMIN, SALES_MANAGER, SALES_REP, WAREHOUSE_MANAGER,
WAREHOUSE_STAFF, CASHIER. The map lives in `server/src/auth/permissions.js`
(area:action strings, e.g. `orders:confirm`).

Enforcement is **backend-only**: `resolveBusiness` loads the caller's
membership for the requested business, and `requirePermission('...')` compares
the membership role. The frontend hides buttons by role for UX, but anyone
calling the API directly gets 403.

## Business (tenant) context

- A user can belong to multiple businesses (separate `Membership` rows).
- The client sends `x-business-id` to choose WHICH business to act on; the
  membership for that pair must exist. **The client cannot gain access to a
  business by sending a random ID** — the row must be a real membership.
- All service queries filter by `req.businessId` and validate foreign entities
  (customer/variant/warehouse ids) against the same business.

## Login flow in the app

1. `app/login.tsx` (RHF + zod form) → `SessionProvider.login()`.
2. Session stores tokens in AsyncStorage (`lib/api/session.ts`).
3. `lib/api/client.ts` — every request attaches both headers; on 401 it tries
   ONE refresh (single-flight even if 10 requests 401 simultaneously), then
   retries; if the refresh is dead it forces signed-out state.
4. On restore: hydrated session → `GET /api/auth/me` → business switcher.

## Password reset (design)

Not implemented (no email provider in scope). The design would be:

1. `POST /api/auth/forgot-password {email}` — always 200 (no account
   enumeration), rate-limited; if the user exists, create a
   `PasswordResetToken` (hash, 1-hour expiry) and email a reset link.
2. `POST /api/auth/reset-password {token,newPassword}` — verify hash, update
   passwordHash, revoke all refresh tokens (kill every session).
Requires SMTP settings in env (`SMTP_URL`, etc.) — never placed in frontend code.
