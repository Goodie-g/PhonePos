# Stoku API Reference

Base URL: `http://localhost:4000`. All responses JSON. Errors always:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": null } }
```

Conventions for every protected call:

- `Authorization: Bearer <accessToken>`
- `x-business-id: <businessId>` (required; must be one of the caller's memberships)
- `Idempotency-Key: <uuid>` — optional but recommended on all mutating business
  endpoints (order create, payoff, receiving). Retry with the same key returns
  the stored FIRST response; the operation is never executed twice.

| Code | Meaning |
|---|---|
| 400 BAD_REQUEST | validation failed (`details` lists fields) |
| 401 UNAUTHORIZED | missing/expired token, bad credentials |
| 403 FORBIDDEN | role lacks permission, or not a member of that business |
| 404 NOT_FOUND | missing record (incl. other-tenant records) |
| 409 DUPLICATE / CONFLICT / CONCURRENT_MODIFICATION | unique violation or retryable conflict |
| 422 | business rule rejected (see codes below) |

### Areas and endpoints

- `POST /api/auth/register` `{email,password,fullName,businessName}` → 201 `{user, accessToken, refreshToken}` — creates business + OWNER + default warehouse/price list.
- `POST /api/auth/login` `{email,password}` → 200 tokens.
- `POST /api/auth/refresh` `{refreshToken}` → 200 new token pair (rotates; reuse of an older token revokes all sessions).
- `POST /api/auth/logout` `{refreshToken}` → 204.
- `GET  /api/auth/me` → profile + memberships (used by the app to pick business roles).

- `GET/POST /api/users` — list members / invite `{email,fullName,password,role}` (`users:manage`).
- `PATCH /api/users/:membershipId` — change role or `isActive`.

- `GET /api/products` `?search&type&status&brandId&sort&page&pageSize`.
- `POST /api/products` `{brandId,categoryId?,name,type:PHONE|ACCESSORY,...}` (`products:manage`).
- `GET /api/products/:id`; `PATCH /api/products/:id` (status/discontinuation).
- `POST /api/products/:id/variants` `{sku,sellPrice,...}`; `PATCH /api/products/variants/:variantId`.
- `GET/POST /api/products/brands`, `GET/POST /api/products/categories`.

- `GET /api/warehouses`, `POST /api/warehouses` `{name,code}` (`warehouses:manage`), `PATCH /api/warehouses/:id`.

- `GET/POST /api/suppliers` (`suppliers:read/manage`), `PATCH /api/suppliers/:id`.

- `POST /api/purchases` — draft PO `{supplierId, items:[{variantId,quantity,unitCost}]}`.
- `POST /api/purchases/:id/submit` | `/cancel` — transitions.
- `POST /api/purchases/:id/receive` — **stock-creating transaction**:
  `{warehouseId, items:[{purchaseOrderItemId,quantity}], devices:[{purchaseOrderItemId,imei1,imei2?,serialNumber?}]}`.
  Effects: balances + StockMovement(RECEIPT), Device rows (unique IMEI — 409 on dupes), receivedQty accumulation, GoodsReceipt history, PO status → RECEIVED/PARTIALLY_RECEIVED, audit.
- `GET /api/purchases`, `GET /api/purchases/:id`.

- `GET /api/inventory/balances` `?warehouseId&variantId` — per-variant stock (`available = onHand - reserved`).
- `GET /api/inventory/movements` — the stock ledger.
- `POST /api/inventory/adjustments` `{warehouseId,variantId,delta,reason}` (`inventory:adjust`) — phones not allowed here (unit-tracked).

- `GET /api/devices` `?imei&status&variantId&warehouseId`; `GET /api/devices/:id` (with movement history).
- `POST /api/devices/:id/mark-available` — RECEIVED → AVAILABLE.

- `GET/POST /api/customers` `{name,creditLimit,paymentTermsDays,priceListId?}`.
- `GET /api/customers/:id/statement` — invoices + payments + outstanding + overdue flags.

- `GET/POST /api/price-lists`; `POST /api/price-lists/:id/items` `{variantId,minQty,unitPrice}`; `DELETE /api/price-lists/:id/items/:itemId`.

- `POST /api/orders` — DRAFT; prices resolved server-side from customer tiers (client sends only `{customerId, warehouseId, items:[{variantId,quantity}]}`).
- `POST /api/orders/:id/submit` — DRAFT → SUBMITTED.
- `POST /api/orders/:id/confirm` — SUBMITTED → CONFIRMED (reserves stock atomically; races get 409).
- `POST /api/orders/:id/fulfil` — consumes reservations → stock leaves warehouse (`items:[{orderItemId,quantity|deviceIds}]`).
- `POST /api/orders/:id/cancel` — releases reservations (DRAFT/SUBMITTED/CONFIRMED only).

- `POST /api/invoices` `{salesOrderId}` — one active invoice per FULFILLED order; checks credit limit (`CREDIT_LIMIT_EXCEEDED`), sets due date, order → INVOICED.
- `POST /api/invoices/:id/payments` `{amount,method,reference?}` — FOR UPDATE row lock; rejects overpayment; partial payments keep outstanding correct; idempotent by key.
- `POST /api/invoices/:id/void` — only when no payments exist.
- `GET /api/invoices` `?status&customerId&overdue`, `GET /api/invoices/:id`.

- `POST /api/transfers` (DRAFT), `/dispatch` (stock leaves source), `/receive` (arrives at destination; partial OK), `/cancel` (un-received goods return to source).

- `POST /api/shipments` `{salesOrderId, items, deviceIds?}` — only fulfilled, un-shipped quantities; `/dispatch`, `/deliver {podReference?}`, `/cancel` (pre-dispatch only).

- `POST /api/returns` `{salesOrderId, reason, items}` — phones must be SOLD on that order; status → RETURNED (not resellable). `/inspect {items:[{returnItemId,outcome:RESTOCK|QUARANTINE}]}` — only RESTOCK creates sellable stock. `/refund {amount}` once.

- `GET /api/reports/dashboard|stock|outstanding|best-sellers` (`reports:read`).
- `GET /api/audit` `?entityType&entityId&action` (`audit:read`).
- `GET /api/health`.

### Example: record a payment

```http
POST /api/invoices/.../payments
Authorization: Bearer <token>
x-business-id: <businessId>
Idempotency-Key: 7c9e6679-742f-4d44-88d0-93e0af77e78b
Content-Type: application/json

{ "amount": 1500000, "method": "MOBILE_MONEY", "reference": "MM-DEMO-0001" }
```

201:
```json
{ "data": { "payment": { "id": "...", "amount": "1500000" }, "invoice": { "status": "PARTIALLY_PAID", "amountPaid": "1500000" }, "replayed": false } }
```
Replaying with the same key → 200, same payment, `replayed: true`.
