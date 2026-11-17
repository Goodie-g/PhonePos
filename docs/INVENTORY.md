# Stoku Inventory & Stock

Study targets: `server/src/services/stock.js` (40 lines of pure logic),
`purchases.service.js` (receiving), `sales.service.js` (reserve/fulfil),
`transfers.service.js`, `modules/inventory/*`.

## The stock ledger

`StockMovement` is append-only. Any quantity change must come from
`services/stock.js`, which:

1. mutates `InventoryBalance` with an **atomic conditional UPDATE** (e.g.
   `UPDATE ... SET onHand = onHand - 5 WHERE onHand >= 5`) so stock can never
   go negative, no matter how many requests race (the DB checks the row, not
   the UI),
2. always inserts a matching `StockMovement` row in the same transaction.

Movement types: RECEIPT (buying), SALE (fulfilment), RESERVE/RELEASE (0-qty
markers with the `reserved` counter), TRANSFER_OUT/TRANSFER_IN, ADJUSTMENT
(manual, reason required), RETURN/RETURN_OUT.

## Two kinds of stock

- **Accessories** — plain quantities in `InventoryBalance`.
- **Phones** — individual `Device` rows with mandatory unique IMEI(s). Balances
  are still maintained (so stock value reports work) but device logic wins:
  a device is AVAILABLE/RESERVED/SOLD/... per its status column.

## Reservations

On **order confirmation** (SUBMITTED → CONFIRMED):

- accessories: raw-SQL atomic reserve (`onHand - reserved >= qty` else 422),
  one `StockReservation` row per line;
- phones: auto-allocate AVAILABLE devices with compare-and-set
  (`UPDATE ... WHERE status='AVAILABLE'`) — two concurrent confirms can never
  both claim the same handset; the loser sees `count === 0` → 422 (pytest-style
  test proves one winner, one 409/422).

On fulfilment: reservation CONSUMED + `onHand` decreased + SALE movement.
On cancel: reservations RELEASED, devices AVAILABLE again.

## Receiving (the only way stock enters)

`POST /api/purchases/:id/receive` runs ONE Serializable transaction:

1. PO must be SUBMITTED/PARTIALLY_RECEIVED; warehouse must exist in-business.
2. Accessories: outstanding check (`receivedQty + qty <= ordered`), balance
   increment + RECEIPT movement.
3. Phones: one Device row per IMEI (DB unique constraint rejects duplicates →
   409), RECEIPT movement per device, status RECEIVED (a warehouse worker then
   marks them AVAILABLE after inspection — deliberate human checkpoint).
4. PO accumulated receivedQty + GoodsReceipt snapshot for receipt history.
5. PO status recomputed; audit row written.

Partial receiving is supported and safe (each receipt is its own transaction).

## Transfers

DRAFT → DISPATCHED (stock leaves source with TRANSFER_OUT; devices go
IN_TRANSIT) → receive (arrives at destination, TRANSFER_IN) possibly in
several partial receives → RECEIVED. Cancellation returns un-received goods to
the source (also via TRANSFER_IN rows) — a transfer can never create or destroy
stock. Genuinely-lost units are written off with `inventory/adjustments`
(+reason +audit), keeping `Σ movements = balance` true at all times.
