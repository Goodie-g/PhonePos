# Stoku — Orders, Invoices & Payments

Study targets: `sales.service.js`, `invoicing.service.js`, then the tests in
`tests/sales.test.js` — they read like executable specifications.

## Distinct statuses (never conflate them)

- **Order status** (money/credit paperwork): DRAFT → SUBMITTED → CONFIRMED →
  PARTIALLY_FULFILLED → FULFILLED → INVOICED (+ CANCELLED side-door).
- **Fulfilment reality**: `SalesOrderItem.fulfilledQty` vs `quantity`.
- **Invoice status**: ISSUED → PARTIALLY_PAID → PAID (+ VOID).
- **Device state** (phones): AVAILABLE → RESERVED → SOLD → (RETURNED →
  inspection → AVAILABLE / QUARANTINED).

Transitions are enforced by service code; there is no endpoint to set an order
status directly.

## Lifecycle rules

1. **Creation (DRAFT).** The client sends only {customerId, warehouseId,
   quantity}. The server resolves unit prices (customer's price-list tier, else
   business default list, else variant sell price), applies optional line
   discounts capped at the line gross, computes subtotal/VAT/grandTotal with
   Decimal. Drafts do NOT reserve anything.

2. **Confirmation reserves stock** atomically (doc/INVENTORY.md). Cannot be
   confirmed twice; can still be cancelled (releases reservations).

3. **Fulfilment** (CONFIRMED/PARTIALLY_FULFILLED): per line —
   accessories by quantity (must not exceed outstanding), phones by exact
   deviceIds that must be RESERVED **for that order line**. Each fulfilment is
   its own transaction: reservations consumed, `onHand` decremented, SALE
   movements written, `fulfilledQty` accumulated, order status recomputed.

4. **Invoicing**: allowed from FULFILLED (one active invoice per order —
   documented simplification: partial invoicing not in v1). Totals are copied
   from the order. `dueAt` = issue + customer payment terms. Credit limit check:
   ≤ limit means "limit enforced"; outstanding(new, before this invoice) + total
   must fit within the limit or it's `CREDIT_LIMIT_EXCEEDED`.

5. **Payments** (`POST /invoices/:id/payments` — audited, idempotent):
   - invoice row locked `FOR UPDATE` so two simultaneous payments cannot both
     push `amountPaid` past the total (row-level serialization);
   - overpayment rejected; each payment DECREASES outstanding; `amountPaid` is
     re-derived as `Σ payments`-consistent state;
   - `PAID` when `amountPaid >= total`;
   - `reference` is whatever the user typed (MM txn id) — this is a *record*,
     not provider verification. Real mobile-money verification would be a
     webhook endpoint with provider signs + idempotency; the schema (unique
     `IdempotencyKey` per business) already supports it.

6. **Cancellation/returns**: cancel only before fulfilment starts; after that,
   use returns (returned phones are RETURNED — inspection decides restock —
   refunds are recorded as a return refundAmount, once).

## Financial concepts (and their limits)

- **Revenue** = Σ invoice totals issued in range (includes VAT).
- **Cash collected** = Σ payments received in range (may lag revenue for
  credit sales).
- **COGS estimate** = for accessories variant.costPrice × qty; for phones the
  device's acquisitionCost. GAP: stored cost is "current", not "at sale time" —
  a mid-period cost change skews old sales. A production-grade fix would
  snapshot unit cost on each order item at fulfilment.
- **Gross profit** = revenue − VAT − COGS estimate → labelled as ESTIMATE in
  the UI on purpose.
