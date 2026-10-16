<!-- Generated: 2026-10-16 | Files scanned: 27 | Token estimate: ~2950 -->
# Sales codemap

Conventions: controllers check permissions, services do not; routes are under global prefix `api`. Create/update mostly return 204 (void) except `POST /orders`. Paths below: `O`=`src/api/orders`, `B`=`src/api/outbound-orders`, `C`=`src/api/clients`, `S`=`src/database/schemas`.

## 1. Modules
- `O/` (SO): `orders.controller.ts` 199, `orders.service.ts` 1045, `orders.query.ts` 26 (`issuedQuantityByOrderItemIdSubquery`:12 = delivered qty per order line, from `inventory_transactions`), `orders.export.ts` 76, `dto/` 14 files. Imports Files, ProductionOrders, Templates (PDF) modules (`orders.module.ts:11`).
- `B/` (DO): `outbound-orders.controller.ts` 231, `.service.ts` 953, `.query.ts` 160 (held-qty and filter helpers), `.export.ts` 73. Imports InventoryModule (`outbound-orders.module.ts:8`).
- `C/`: `clients.controller.ts` 118, `clients.service.ts` 354 (clients + contacts).
- `src/api/client-groups/` (controller 26, service 49) and `src/api/countries/` (controller 23, service 34): read-only lookups.
- Schemas: `S/orders/{orders 241, order-items 109, order-files 38}.ts`, `S/clients/{clients 77, client-contacts 41, client-groups 15}.ts`, `S/countries.ts` 15, `S/inventory/{outbound-orders 135, outbound-order-items 91}.ts`.

## 2. Routes (35 total)
Orders (13), `@Controller('orders')`; static routes are declared before `:orderId`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /orders | orders:read | `O/orders.controller.ts:44` -> `getOrders` (service:91) | - |
| GET /orders/stats | orders:read | :58 -> `getOrderStats` (:243) | - |
| GET /orders/export-excel and /orders/export (alias) | orders:read | :68, :80 -> `exportOrdersExcel` (:191, cap 10,000 rows) | - |
| GET /orders/export-summary-pdf | orders:read | :91 -> `exportOrdersSummaryPdf` (:457) | - |
| GET /orders/:orderId | orders:read | :104 -> `getOrder` (:310) | - |
| GET /orders/:orderId/export-pdf | orders:read | :114 -> `exportOrderPdf` (:367) | - |
| GET /orders/:orderId/items | orders:read | :127 -> `getOrderItems` (:538) | - |
| POST /orders | orders:create | :140 -> `createOrder` (:580) | orders, order_items, order_files, document_sequences |
| PATCH /orders/:orderId | orders:update | :154 -> `updateOrder` (:646) | orders, order_items, order_files; deletes production_orders on cancel |
| POST /orders/:orderId/approve | orders:approve | :168 -> `approveOrder` (:729) | orders, production_orders, production_order_items, logs |
| POST /orders/:orderId/reject | orders:approve | :182 -> `rejectOrder` (:760) | orders |
| DELETE /orders/:orderId | orders:delete | :196 -> `deleteOrder` (:779) | orders.deletedAt |

Outbound orders (13), `@Controller('outbound-orders')`; handler lines in `B/outbound-orders.controller.ts`, service lines in `.service.ts`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /outbound-orders | outbound:read | :45 -> `getOutboundOrders` (:98) | - |
| GET .../unfulfilled-order-items | outbound:read | :59 -> `getUnfulfilledOrderItems` (:304) | - |
| GET .../export | outbound:read | :74 -> `exportOutboundOrders` (:156) | - |
| GET .../:outboundOrderId | outbound:read | :86 -> `getOutboundOrder` (:217) | - |
| GET .../:outboundOrderId/items | outbound:read | :99 -> `getOutboundOrderItems` (:244) | - |
| POST /outbound-orders | outbound:create | :112 -> `createOutboundOrder` (:430) | outbound_orders, outbound_order_items, document_sequences |
| PATCH .../:id | outbound:update | :128 -> `updateOutboundOrder` (:455) | outbound_orders, outbound_order_items |
| POST .../:id/send | outbound:update | :145 -> `sendOutboundOrder` (:566) | outbound_orders |
| POST .../:id/approve | outbound:approve | :162 -> `approveOutboundOrder` (:601) | outbound_orders |
| POST .../:id/reject | outbound:approve | :178 -> `rejectOutboundOrder` (:682) | outbound_orders |
| POST .../:id/deliver | outbound:update | :197 -> `postOutboundOrder` (:747) | outbound_orders, orders, inventory_issues, inventory_issue_items, inventory_transactions, inventory_balances |
| POST .../:id/cancel | outbound:update | :214 -> `cancelOutboundOrder` (:486) | outbound_orders |
| DELETE .../:id | outbound:delete | :226 -> `deleteOutboundOrder` (:512) | outbound_orders (hard delete, items cascade) |

Clients (7), handler lines in `C/clients.controller.ts`, service in `clients.service.ts`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /clients | clients:read | :41 -> `getClients` (:49) | - |
| GET /clients/options | clients:read | :54 -> `getClientOptions` (:101, limit 100) | - |
| GET /clients/:clientId | clients:read | :66 -> `getClient` (:128) | - |
| GET /clients/:clientId/contacts | clients:read | :77 -> `getClientContacts` (:147) | - |
| POST /clients | clients:create | :89 -> `createClient` (:161) | clients, client_contacts |
| PATCH /clients/:clientId | clients:update | :102 -> `updateClient` (:199) | clients, client_contacts (replace-all, :269) |
| DELETE /clients/:clientId | clients:delete | :115 -> `deleteClient` (:237) | clients.deletedAt |

Public (no JWT, `@ApiPublic`): `GET /client-groups` (1) `client-groups.controller.ts:21` -> `getClientGroups` (service:18) reads `client_groups`; `GET /countries` (1) `countries.controller.ts:20` -> `getCountries` (service:16) reads `countries`, alphabetical, unpaginated.

## 3. State flows
SO status (`S/orders/orders.ts:35`). No dedicated submit route: DRAFT -> PENDING_CONFIRMATION is a client-sent `status` on POST/PATCH.
  DRAFT --(PATCH status)--> PENDING_CONFIRMATION --approveOrder--> AWAITING_PRODUCTION --approveProductionOrder--> IN_PROGRESS --postOutboundOrder/closeOrdersIfFullyDelivered--> COMPLETED
  PENDING_CONFIRMATION --rejectOrder--> REJECTED --updateOrder (no status sent)--> DRAFT; an explicit status sent with the PATCH (e.g. PENDING_CONFIRMATION, CANCELLED) is applied as sent instead of DRAFT (`updateOrder`, `revertsToDraft`)
  any editable state --updateOrder (status=CANCELLED)--> CANCELLED
`approveOrder` (service:729): guard `ensurePendingConfirmation` (:1022), `ensureItemsNotLockedByProduction` (:952), `getInitialPlanItems` (`production-orders.service.ts:547`, read-only), then one tx: set AWAITING_PRODUCTION + approvedBy/At, `seedPlan` (`production-orders.service.ts:610`).

SO -> LSX:
  approveOrder -> seedPlan: delete-and-reuse branch for an old ORDER-type LSX (`orderLsxCondition`:600) is effectively unreachable here because `ensureItemsNotLockedByProduction` throws E080 first; insert `production_orders` PENDING (code reused if existed) + `production_order_items` (suggested qty = need beyond available stock) + CREATED log
  -> (LSX qty editable while PENDING, `updateProductionOrder`:335)
  -> `approveProductionOrder` (:434): LSX APPROVED (or COMPLETED if every line is fully from stock), `orders.status = IN_PROGRESS` (:503), `createJobs` makes JOBs
  NCR path: `NcrsService.createProductionOrder` (`ncrs.service.ts:337`) inserts LSX with `source_type=NCR`, same `orderId`, already APPROVED, 1 JOB; order status untouched.

DO status (`S/inventory/outbound-orders.ts:34`), each step locks the row with `getOutboundOrderForUpdate` (:893):
  DRAFT --sendOutboundOrder--> PENDING_APPROVAL --approveOutboundOrder--> PENDING_DELIVERY --postOutboundOrder--> DELIVERED
  PENDING_APPROVAL --rejectOutboundOrder--> REJECTED --sendOutboundOrder--> PENDING_APPROVAL
  DRAFT | PENDING_APPROVAL | PENDING_DELIVERY --cancelOutboundOrder--> CANCELLED;   DRAFT --deleteOutboundOrder--> (row removed)

Stock reservation: DRAFT, PENDING_APPROVAL, PENDING_DELIVERY hold finished goods (`HOLDING_STATUSES`, `B/outbound-orders.query.ts:16`); `getOutboundHeldQuantities`:58 and `outboundHeldQuantityByItemSubquery`:26 sum held qty per item. `ensureOutboundLinesIssuable` (service:633), called from create (:448), update (:478), send (:584), approve (:615): sums line qty per `itemId`, locks balances (`getInventoryBalancesForUpdate`, `inventory/item-stock.query.ts:15`), then requires qty <= onHand - held by OTHER DOs, else E194.
Delivery: `postOutboundOrder` (:747) in one tx: require PENDING_DELIVERY (E237) -> insert `inventory_issues` (SALES, POSTED, `outboundOrderId`, code `PXK-yyyy-nnnnn`, :830) + `inventory_issue_items` -> `InventoryPostingService.postDocument` with negative qty and `orderItemId` (writes `inventory_transactions`/balances) -> DO = DELIVERED -> `closeOrdersIfFullyDelivered` (:847): SO goes COMPLETED only if currently IN_PROGRESS and every NORMAL line has delivered qty >= ordered qty.

SO cancel/delete guards: PATCH blocked on COMPLETED/CANCELLED (E065) and PENDING_CONFIRMATION (E090), `ensureOrderEditable`:991. Cancel: E236 if its ORDER-LSX is APPROVED (`ensureProductionOrderNotApproved`:971); a PENDING LSX is deleted in the same tx (:704). Delete: only DRAFT or REJECTED, soft delete (`ensureOrderDeletable`:1003, E264). Client delete: E246 if any `orders` or `outbound_orders` row exists, including soft-deleted orders (`ensureClientNotInUse`:250).

## 4. Key rules and error codes (`src/constants/error-code.constant.ts`)
- Money columns of SO are server-owned: `recalculateTotals` (orders.service:818) recomputes `line_total`, subtotal, discount, VAT, total; VND forces `exchangeRate=1` (:808). SO code `SOnnnn` (:888); DO code `DO-yyMMdd-nnn` (:938).
- Items replace-all on PATCH (`replaceOrderItems`:858) but E080 if the SO already has an ORDER-LSX (:952). `status` AWAITING_PRODUCTION/REJECTED cannot be sent by clients: E075 (:1012). Other values including IN_PROGRESS/COMPLETED are not blocked there (unverified whether intended).
- SO: E057 not found (:1040), E059 client missing, E060 staff missing, E061 item missing, E275 contact not of client (:905), E074 not PENDING_CONFIRMATION (:1022), E090/E065/E080/E236/E264/E075 above.
- DO: E195 not found; E259 edit only in DRAFT (:468); E258 delete only in DRAFT (:532); E257 cancel only from 3 states (:499); E239 send only from DRAFT/REJECTED (:580); E240 approve/reject only from PENDING_APPROVAL (:612, :694); E237 deliver only from PENDING_DELIVERY (:758); E194 qty over issuable (:675); E205 QC gate, send only (`ensureAllJobsQcCompleted`:717): each distinct JOB needs QC coverage and no open IQC, and either at least one completed final OQC lot (JOB has a final OQC operation) or no open QC row at all (JOB has none). DO create requires an existing client (E009, :930); `clientId` is immutable on update.
- Unfulfilled picker (service:304): SO in AWAITING_PRODUCTION/IN_PROGRESS (:86), NORMAL lines, delivered < ordered; JOB matched by `productionOrderId` + `itemId`.
- Clients: E009 not found, E024 code unique among non-deleted (:304, also catches PG 23505), E025 taxCode unique but ignores `deletedAt` (:326), E026 group missing (:344), E246 in use.

## 5. Cross-domain links
- Production (LSX/JOB): `OrdersService` calls `ProductionOrdersService.getInitialPlanItems/seedPlan`; LSX approval flips SO to IN_PROGRESS (`production-orders.service.ts:503`); `production_orders.orderId` unique per `source_type=ORDER` (`S/production/production-orders.ts:117`).
- Inventory: DO delivery writes `inventory_issues.outboundOrderId` (`S/inventory/inventory-issues.ts:63`); `InventoryService` copies delivered/open-demand queries for AWAITING_PRODUCTION and IN_PROGRESS SO (`inventory/inventory.query.ts:92`); `OrdersService.getOrderItems` exposes `issuedQty`/`remainingQty` (unclamped).
- Quality: DO send reads `getJobQcCoverage`/`getJobFinalOperation` (`oqc/oqc.query.ts:213`, :112). NCR rows from OQC copy `orderId` from the JOB's LSX (`ncrs/ncrs.write.ts:69`); secondary LSX reuses it, E305 if missing (`ncrs.service.ts:347`).
- Items: SO and DO lines reference `items` with restrict FK; `outbound_order_items.productionJobId` is a display snapshot, set null if the JOB is deleted on LSX re-approval (`S/inventory/outbound-order-items.ts:35-40`).
- Others reading SO: `reports.service.ts`, `integration/integration-orders.service.ts` (raw SQL on `orders`), payment-requests and purchase-orders modules (not read; unverified how).
