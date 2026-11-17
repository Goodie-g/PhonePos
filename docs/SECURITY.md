# Stoku — Security Notes

## What is implemented

- **bcrypt** password hashing (never plaintext; login errors identical for
  wrong-user vs wrong-password to prevent account enumeration).
- **JWT + rotating refresh tokens** (docs/AUTHENTICATION.md); refresh reuse
  immediately kills all sessions of that user.
- **RBAC middleware** — `requirePermission(area:action)` against the caller's
  membership role; route handlers declare what they need.
- **Tenant isolation** — `resolveBusiness` verifies the membership; every
  business query filters `businessId`; foreign-entity ids (variants, customers,
  warehouses) are validated to belong to the same business before use.
  Cross-tenant reads return 404 (never confirm existence).
- **zod validation** on every route (body/query/params); unknown fields ignored.
- **helmet** security headers; **CORS allow-list** (non-browser clients pass:
  bearer tokens, not cookies); **rate limiting** strict on `/api/auth`.
- **Errors normalized** — one handler; 500s never include stack traces in prod.
- **No SQL injection surface** — all queries via Prisma (parameterized); the
  only raw SQL (`reserve()`, invoice lock) uses tagged-template parameters.
- **Idempotency keys** to defeat double-submits and network retries.
- **Audit trail** written inside the same transaction as important changes;
  no API mutates AuditLog rows.

## Threat model highlights

| Threat | Mitigation |
|---|---|
| Stolen access token | 15-min expiry; refresh rotation; reuse detection |
| Stolen refresh token | hashed at rest; rotation; global revocation on reuse |
| Tenant hopping | membership check + businessId scoping + entity validation |
| Privilege escalation | roles come from DB membership, never from the client |
| Overselling | conditional updates / Serializable transactions |
| Duplicate money events | idempotency keys + DB unique constraints |
| Brute force | rate limit on auth routes (429) |
| Information leak | generic errors; 404 hides foreign records |

## Secrets policy

- Only `server/.env` (gitignored) holds `DATABASE_URL` and `JWT_SECRET`;
  `.env.example` shows the shape. The Expo app holds NO secrets — it only knows
  the API base URL (`EXPO_PUBLIC_API_URL` is public by nature).
- The seeds use fictional IMEIs and fake payment references by design.

## Known limitations (be honest)

- Access tokens cannot be revoked individually (stateless JWT); compromise
  window ≤ 15 min. A `TokenVersion` column per user would add instant revocation.
- No email infrastructure → password reset designed but not wired.
- Mobile-money payment references are recorded, not verified. A production
  integration must verify callbacks server-side against provider APIs.
