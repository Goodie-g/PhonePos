# Stoku Database Design

PostgreSQL via Prisma. Full schema: `server/prisma/schema.prisma`.
This doc explains the modelling decisions you should study.

## Entity map — what each table means

| Table | Represents | Key facts |
|---|---|---|
| `Business` | A tenant (company) | currency default TZS, VAT %; owns everything |
| `User` | A login | bcrypt hash, unique lowercased email |
| `Membership` | User ↔ Business with a `Role` | unique per (user, business); permissions source |
| `RefreshToken` | One device/session | stores SHA-256 hash only; rotation on use |
| `Brand`, `Category` | Catalogue taxonomy | unique per business |
| `Product` | A phone/accessory MODEL ("Galaxy A15") | NOT sellable by itself |
| `ProductVariant` | A sellable SKU ("A15 128GB Black") | sku/barcode/capacity/colour, cost & sell prices |
| `Device` | ONE physical handset | unique imei1/imei2 globally, lifecycle status, location, cost |
| `Warehouse` | Storage location | unique code per business |
| `InventoryBalance` | Cached qty per variant+warehouse | `onHand` & `reserved`; accessorial AND phones (phones additionally have Device rows) |
| `StockMovement` | Append-only stock ledger | every quantity change; never updated/deleted |
| `StockReservation` | Reserved qty per order line (accessories) | ACTIVE → CONSUMED/RELEASED |
| `Supplier`, `PurchaseOrder`, `PurchaseOrderItem` | Buying | PO lines keep receivedQty; costs snapshot into Items |
| `GoodsReceipt`, `GoodsReceiptItem` | One physical receiving event | partial receiving keeps a receipt history |
| `Customer` | Business customer account | code, credit limit, payment terms, price list, status |
| `PriceList`, `PriceListItem` | Quantity-break tiers | unique (list, variant, minQty) |
| `SalesOrder`, `SalesOrderItem` | A wholesale order | money totals computed server-side; `fulfilledQty` tracks partial fulfilment |
| `Invoice` | Issued per FULFILLED order | amountPaid never exceeds total; status machine |
| `Payment` | Recorded cash/money movement | optional reference + unique idempotency key |
| `StockTransfer`, `StockTransferItem`, `StockTransferDevice` | Moving stock between warehouses | explicit dispatch & receive sides |
| `Shipment`, `ShipmentItem`, `ShipmentDevice` | Delivery of fulfilled order lines | POD reference at delivery |
| `SalesReturn`, `SalesReturnItem` | Returned goods + inspection | device stays unsellable until RESTOCK decision |
| `AuditLog` | Who did what | written inside the same transaction as the change |
| `IdempotencyKey` | Retry protection | unique per (business, endpoint, key); stores first response |
| `DocumentCounter` | Per-business numbering (SO-000123…) | incremented atomically inside the creating tx |

## Decisions worth studying

1. **Money = `Decimal(19,4)`.** JS floats (`0.1 + 0.2 === 0.30000000000000004`)
   must never touch money. Money arithmetic uses `Prisma.Decimal` (decimal.js)
   server-side; JSON responses keep decimals as strings and the UI just formats.

2. **Three catalogue levels.** Product (model) → Variant (sellable SKU) →
   Device (individual handset). Accessories stop at Variant + quantity.

3. **Balances + ledger.** `InventoryBalance` exists for fast reads (dashboard,
   availability checks); `StockMovement` is the append-only audit of every
   change. Balances are only ever written through `services/stock.js`, always
   inside the same transaction as their movement — so a balance can always be
   reconstructed by summing movements.

4. **Never negative.** `adjustOnHand` with a negative delta opens a
   conditional UPDATE `WHERE onHand >= -delta`. Under concurrency the database
   serializes on the row and the loser gets `INSUFFICIENT_STOCK` — the UI's
   "there is stock" can never be trusted, the row check is the guarantee.

5. **IMEI uniqueness is a database constraint**, not a service check. Race
   condition on two people receiving the same IMEI simultaneously is impossible
   to catch reliably in application code; `@unique` + P2002→409 is exact.

6. **Reservation split by stock kind.** Accessories: `reserved` counter +
   `StockReservation` rows (raw-SQL atomic reserve). Phones: `Device.status =
   RESERVED` + `reservedOrderItemId` claimed via compare-and-set UPDATE —
   a device can only ever be claimed by exactly one order.

7. **Tenant isolation at the query level.** Every business-owned table has
   `businessId` FKs, and services add `where: { businessId: req.businessId }`
   everywhere — including validation lookups ("does this variant belong to MY
   business?"). Cross-tenant access attempts return 404 (existence not leaked)
   or 403.

8. **Documents use per-business counters** inside the creating transaction
   (`doc-number.js`) — a concurrent-increment-safe alternative to naive
   `count()+1`, and no race between "number assignment" and "document insert".
