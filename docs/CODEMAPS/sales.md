<!-- Generated: 2026-11-04 | Files scanned: 33 | Token estimate: ~3500 -->
# Sales codemap

Conventions: controllers check permissions, services do not; routes are under global prefix `api`. Create/update mostly return 204 (void) except `POST /orders`. Paths below: `O`=`src/api/orders`, `B`=`src/api/outbound-orders`, `C`=`src/api/clients`, `S`=`src/database/schemas`.

## 1. Modules
- `O/` (SO): `orders.controller.ts` 214, `orders.service.ts` 1161, `orders.query.ts` 63 (`issuedQuantityByOrderItemIdSubquery`:18 = delivered qty per order line, from `inventory_transactions`; `invoicesByOrderItemIdSubquery`:37 = invoice numbers and latest date per order line, from DELIVERED + ISSUED DOs), `orders.export.ts` 128 (column map of the "Theo dõi đơn hàng" Excel; Thành tiền is a formula + stored amount for VND orders, a plain amount for foreign-currency orders), `templates/order-tracking-template.xlsx` (the customer's workbook, copied by `nest-cli.json` assets), `dto/` 22 files, `orders-summary.service.ts` 304 + `orders-summary.constant.ts` (read-only summary queries behind the four summary routes below). Imports Files, ProductionOrders, Templates (PDF) modules (`orders.module.ts:11`).
- `B/` (DO): `outbound-orders.controller.ts` 250, `.service.ts` 968, `.query.ts` 210 (held-qty and filter helpers, `closeOrdersIfFullyDelivered`:168), `.export.ts` 94, `outbound-orders-summary.service.ts` 52 + `.constant.ts` (pending-delivery list). No module imports; posting the DO's issue lives in `InventoryIssuesService`.
- `C/`: `clients.controller.ts` 118, `clients.service.ts` 354 (clients + contacts), `clients-summary.service.ts` 36 (`status-stats`).
- `src/api/client-groups/` (controller 26, service 49) and `src/api/countries/` (controller 23, service 34): read-only lookups.
- Schemas: `S/orders/{orders 241, order-items 109, order-files 38}.ts`, `S/clients/{clients 77, client-contacts 41, client-groups 15}.ts`, `S/countries.ts` 15, `S/inventory/{outbound-orders 161, outbound-order-items 91}.ts`.

## 2. Routes (42 total)
Orders (18), `@Controller('orders')`; static routes are declared before `:orderId`. The four summary routes (`value-summary`, `top-value`, `overdue`, `progress`) are served by `OrdersSummaryService` (`O/orders-summary.service.ts`), need only `orders:read`, return plain arrays (no paging, `limit` max 50), report values in VND (`total * exchangeRate`), and are MCP tools (`order_*`, see `mcp.md`). Day maths uses "today" in Asia/Ho_Chi_Minh (`TODAY`, `src/common/summary/summary.sql.ts`); shared caps and DTO bases are in `src/common/summary/`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /orders | orders:read | `O/orders.controller.ts:57` -> `getOrders` (service:94) | - |
| GET /orders/stats | orders:read | :71 -> `getOrderStats` (:294) | - |
| GET /orders/value-summary | orders:read | :84 -> `getOrderValueSummary` (summary svc:73). `groupBy` month (default) \| client \| status \| salesperson; `metric` total (default) \| count ranks client/status/salesperson groups; filters `startDate`/`endDate` (on `orderDate`), `status`, `excludeRejected` (default true unless `groupBy=status` or `status` is set), `minTotal`/`maxTotal` (only `groupBy=client`, on the client's period total, even when `metric=count`); `limit` default 10 for client/salesperson | - |
| GET /orders/top-value | orders:read | :98 -> `getOrderTopValue` (:98): largest single orders by `total`; same date/status/`excludeRejected`/`minTotal`/`maxTotal` filters; `limit` default 10 | - |
| GET /orders/overdue | orders:read | :112 -> `getOverdueOrders` (:135): `statuses` (CSV, default AWAITING_PRODUCTION + IN_PROGRESS), `dueWithinDays` 0-30 (0 = already past `dueDate`, N adds orders due within N days), `limit` default 20 | - |
| GET /orders/progress | orders:read | :126 -> `getOrderProgress` (:167): per SO `jobCount` and `completedJobCount` over the ORDER-type LSX only (NCR secondary LSX excluded); `orderCode` returns that SO whatever its status, else `status` (default AWAITING_PRODUCTION + IN_PROGRESS), `limit` default 20 | - |
| GET /orders/export-excel and /orders/export (alias) | orders:read | :138, :150 -> `exportOrdersExcel` (:208; one Excel row per non-cancelled order line via `findOrderItemTrackings`:238, VND, cap 10,000 lines; filled into the template by `buildXlsxFromTemplate`) | - |
| GET /orders/export-summary-pdf | orders:read | :161 -> `exportOrdersSummaryPdf` (:517) | - |
| GET /orders/:orderId | orders:read | :174 -> `getOrder` (:361) | - |
| GET /orders/:orderId/export-pdf | orders:read | :184 -> `exportOrderPdf` (:418) | - |
| GET /orders/:orderId/items | orders:read | :197 -> `getOrderItems` (:603) | - |
| POST /orders | orders:create | :210 -> `createOrder` (:645) | orders, order_items, order_files |
| PATCH /orders/:orderId | orders:update | :224 -> `updateOrder` (:711) | orders, order_items, order_files; deletes production_orders on cancel |
| PATCH /orders/:orderId/buyer-po | orders:update | :238 -> `updateOrderBuyerPo` (:801) | orders.buyerPoNo |
| POST /orders/:orderId/approve | orders:approve | :252 -> `approveOrder` (:816) | orders, production_orders, production_order_items, logs |
| POST /orders/:orderId/reject | orders:approve | :266 -> `rejectOrder` (:847) | orders |
| DELETE /orders/:orderId | orders:delete | :280 -> `deleteOrder` (:866) | orders.deletedAt |

Outbound orders (16), `@Controller('outbound-orders')`; handler lines in `B/outbound-orders.controller.ts`, service lines in `.service.ts`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /outbound-orders | outbound:read | :54 -> `getOutboundOrders` (:95) | - |
| GET .../stats | outbound:read | :68 -> `getOutboundOrderStats` (:156) - `{total, notInvoiced}`, own filter DTO (no status/invoiceStatus/paging), declared before `:outboundOrderId` | - |
| GET .../pending-delivery | outbound:read | :83 -> `OutboundOrdersSummaryService.getPendingDeliveryOutboundOrders` (summary svc:22): DOs in PENDING_DELIVERY with `fulfillmentDate` within `daysAhead` days (default 7, max 60; overdue ones included), `limit` default 20; same permission as the other outbound-orders routes | - |
| GET .../unfulfilled-order-items | outbound:read | :99 -> `getUnfulfilledOrderItems` (:365) | - |
| GET .../export | outbound:read | :114 -> `exportOutboundOrders` (:197) | - |
| GET .../:outboundOrderId | outbound:read | :126 -> `getOutboundOrder` (:265) | - |
| GET .../:outboundOrderId/items | outbound:read | :139 -> `getOutboundOrderItems` (:305) | - |
| POST /outbound-orders | outbound:create | :152 -> `createOutboundOrder` (:491) | outbound_orders, outbound_order_items |
| PATCH .../:id | outbound:update | :168 -> `updateOutboundOrder` (:516) | outbound_orders, outbound_order_items |
| POST .../:id/send | outbound:update | :185 -> `sendOutboundOrder` (:637) | outbound_orders |
| POST .../:id/approve | outbound:approve | :202 -> `approveOutboundOrder` (:672) | outbound_orders, inventory_issues + inventory_issue_items (DRAFT SALES issue) |
| POST .../:id/reject | outbound:approve | :218 -> `rejectOutboundOrder` (:755) | outbound_orders |
| PATCH .../:id/invoice | outbound:invoice | :237 -> `updateOutboundOrderInvoice` (:819) - DELIVERED only, else E320; saving sets `invoiceStatus = ISSUED` | outbound_orders (invoice_status, invoice_no, invoice_date, invoiced_by, invoiced_at) |
| POST .../:id/cancel | outbound:update | :256 -> `cancelOutboundOrder` (:547) | outbound_orders, inventory_issues (DRAFT issue -> CANCELLED) |
| DELETE .../:id | outbound:delete | :268 -> `deleteOutboundOrder` (:583) | outbound_orders (hard delete, items cascade) |

Clients (8), handler lines in `C/clients.controller.ts`, service in `clients.service.ts`.
| Route | Perm | Handler -> Service | Writes |
|---|---|---|---|
| GET /clients | clients:read | :47 -> `getClients` (:49) | - |
| GET /clients/options | clients:read | :60 -> `getClientOptions` (:101, limit 100) | - |
| GET /clients/status-stats | clients:read | :74 -> `ClientsSummaryService.getClientStatusStats` (summary svc:15): client counts per status, optional `status` filter; declared before `:clientId` | - |
| GET /clients/:clientId | clients:read | :86 -> `getClient` (:128) | - |
| GET /clients/:clientId/contacts | clients:read | :97 -> `getClientContacts` (:147) | - |
| POST /clients | clients:create | :109 -> `createClient` (:161) | clients, client_contacts |
| PATCH /clients/:clientId | clients:update | :122 -> `updateClient` (:199) | clients, client_contacts (replace-all, :269) |
| DELETE /clients/:clientId | clients:delete | :135 -> `deleteClient` (:237) | clients.deletedAt |

Public (no JWT, `@ApiPublic`): `GET /client-groups` (1) `client-groups.controller.ts:21` -> `getClientGroups` (service:18) reads `client_groups`; `GET /countries` (1) `countries.controller.ts:20` -> `getCountries` (service:16) reads `countries`, alphabetical, unpaginated.

## 3. State flows
SO status (`S/orders/orders.ts:35`). No dedicated submit route: DRAFT -> PENDING_CONFIRMATION is a client-sent `status` on POST/PATCH.
  DRAFT --(PATCH status)--> PENDING_CONFIRMATION --approveOrder--> AWAITING_PRODUCTION --approveProductionOrder--> IN_PROGRESS --postInventoryIssue/closeOrdersIfFullyDelivered--> COMPLETED
  PENDING_CONFIRMATION --rejectOrder--> REJECTED --updateOrder (no status sent)--> DRAFT; an explicit status sent with the PATCH (e.g. PENDING_CONFIRMATION, CANCELLED) is applied as sent instead of DRAFT (`updateOrder`, `revertsToDraft`)
  any editable state --updateOrder (status=CANCELLED)--> CANCELLED
`approveOrder` (service:768): guard `ensurePendingConfirmation` (:1090), `ensureItemsNotLockedByProduction` (:991), `getInitialPlanItems` (`production-orders.service.ts:547`, read-only), then one tx: set AWAITING_PRODUCTION + approvedBy/At, `seedPlan` (`production-orders.service.ts:610`).

SO -> LSX:
  approveOrder -> seedPlan: delete-and-reuse branch for an old ORDER-type LSX (`orderLsxCondition`:600) is effectively unreachable here because `ensureItemsNotLockedByProduction` throws E080 first; insert `production_orders` PENDING (code reused if existed) + `production_order_items` (suggested qty = need beyond available stock) + CREATED log
  -> (LSX qty editable while PENDING, `updateProductionOrder`:335)
  -> `approveProductionOrder` (:434): LSX APPROVED (or COMPLETED if every line is fully from stock), `orders.status = IN_PROGRESS` (:503), `createJobs` makes JOBs
  NCR path: `NcrsService.createProductionOrder` (`ncrs.service.ts:337`) inserts LSX with `source_type=NCR`, same `orderId`, already APPROVED, 1 JOB; order status untouched.

DO status (`S/inventory/outbound-orders.ts:44`), each step locks the row with `getOutboundOrderForUpdate` (:908):
  DRAFT --sendOutboundOrder--> PENDING_APPROVAL --approveOutboundOrder--> PENDING_DELIVERY ("Chờ xuất kho") --InventoryIssuesService.postInventoryIssue--> DELIVERED
  PENDING_APPROVAL --rejectOutboundOrder--> REJECTED --sendOutboundOrder--> PENDING_APPROVAL
  DRAFT | PENDING_APPROVAL | PENDING_DELIVERY --cancelOutboundOrder--> CANCELLED;   DRAFT --deleteOutboundOrder--> (row removed)

Stock reservation: DRAFT, PENDING_APPROVAL, PENDING_DELIVERY hold finished goods (`HOLDING_STATUSES`, `B/outbound-orders.query.ts:16`); `getOutboundHeldQuantities`:58 and `outboundHeldQuantityByItemSubquery`:26 sum held qty per item. `ensureOutboundLinesIssuable` (service:706), called from create (:448), update (:478), send (:584), approve (:615): sums line qty per `itemId`, locks balances (`getInventoryBalancesForUpdate`, `inventory/item-stock.query.ts:15`), then requires qty <= onHand - held by OTHER DOs, else E194.
Delivery is two steps. Approve (`approveOutboundOrder`, same tx as the status change) calls `createSalesIssueDraft` (:849): a DRAFT `inventory_issues` (SALES, `outboundOrderId`, code `PXK-yyyy-nnnnn`) with the DO's lines; stock is untouched. The warehouse then posts it (`InventoryIssuesService.postInventoryIssue`, `inventory:update`): lock DO row, then issue row; DO must be PENDING_DELIVERY (E237); `postDocument` writes negative `inventory_transactions` dated the posting day (not the approval day) -> DO = DELIVERED -> `closeOrdersIfFullyDelivered` (`B/outbound-orders.query.ts`:168): SO goes COMPLETED only if currently IN_PROGRESS and every NORMAL line has delivered qty >= ordered qty.
Invoice (separate flag, not a status): DELIVERED DOs start `invoiceStatus = NOT_ISSUED` (so do all older and not-yet-delivered DOs); `updateOutboundOrderInvoice` locks the DO row, requires DELIVERED (E320) and writes number (trimmed, <= 100) + date + `invoicedBy/At`, re-saving overwrites (last writer wins). `invoiceStatus` is a list/export filter; non-delivered DOs are always NOT_ISSUED, so "not invoiced" lists must also send `status=DELIVERED` to match the `notInvoiced` count. `outbound:invoice` is granted to nobody by default.
Cancel both ways: `cancelOutboundOrder` also cancels the DRAFT issue; `InventoryIssuesService.cancelInventoryIssue` on a DO-linked issue cancels the DO and needs `outbound:update` as well (controller passes `canCancelOutboundOrder`, else E033). Update/delete of a DO-linked issue is blocked (E319). Badge `salesIssuesToPost` = DRAFT SALES issues; `inventoryIssuesToPost` now counts the other types.

SO cancel/delete guards: PATCH blocked on COMPLETED/CANCELLED (E065) and PENDING_CONFIRMATION (E090), `ensureOrderEditable`:1030. Cancel: E236 if its ORDER-LSX is APPROVED (`ensureProductionOrderNotApproved`:1010); a PENDING LSX is deleted in the same tx (:723). Delete: only DRAFT or REJECTED, soft delete (`ensureOrderDeletable`:1042, E264). Client delete: E246 if any `orders` or `outbound_orders` row exists, including soft-deleted orders (`ensureClientNotInUse`:250).

## 4. Key rules and error codes (`src/constants/error-code.constant.ts`)
- Money columns of SO are server-owned: `recalculateTotals` (orders.service:857) recomputes `line_total`, subtotal, discount, VAT, total; VND forces `exchangeRate=1` (:847). SO code `SOnnnn` (:927); DO code `DO-yyMMdd-nnn` (:938).
- Items replace-all on PATCH (`replaceOrderItems`:858) but E080 if the SO already has an ORDER-LSX (:952). PATCH `status` goes through `ensureStatusTransitionAllowed` (`PATCHABLE_STATUS_SOURCES`): same status or undefined passes; PENDING_CONFIRMATION only from DRAFT/REJECTED, DRAFT only from REJECTED, CANCELLED from DRAFT/REJECTED/AWAITING_PRODUCTION/IN_PROGRESS; anything else (IN_PROGRESS, COMPLETED, AWAITING_PRODUCTION, REJECTED) is E075. `createOrder` still uses `ensureStatusSettable`.
- SO: E057 not found (:1040), E059 client missing, E060 staff missing, E061 item missing, E275 contact not of client (:905), E074 not PENDING_CONFIRMATION (:1022), E090/E065/E080/E236/E264/E075 above.
- DO: E195 not found; E259 edit only in DRAFT (:468); E258 delete only in DRAFT (:532); E257 cancel only from 3 states (:499); E239 send only from DRAFT/REJECTED (:580); E240 approve/reject only from PENDING_APPROVAL (:612, :694); E237 posting/cancelling the DO's issue only while the DO is PENDING_DELIVERY; E319 DO-linked issue is not editable/deletable; E194 qty over issuable (:675); E205 QC gate, send only (`ensureAllJobsQcCompleted`:717): each distinct JOB needs QC coverage and no open IQC, and either at least one completed final OQC lot (JOB has a final OQC operation) or no open QC row at all (JOB has none). DO create requires an existing client (E009, :930); `clientId` is immutable on update.
- Unfulfilled picker (service:304): SO in AWAITING_PRODUCTION/IN_PROGRESS (:86), NORMAL lines, delivered < ordered; JOB matched by `productionOrderId` + `itemId`.
- Clients: E009 not found, E024 code unique among non-deleted (:304, also catches PG 23505), E025 taxCode unique but ignores `deletedAt` (:326), E026 group missing (:344), E246 in use.

## 5. Cross-domain links
- Production (LSX/JOB): `OrdersService` calls `ProductionOrdersService.getInitialPlanItems/seedPlan`; LSX approval flips SO to IN_PROGRESS (`production-orders.service.ts:503`); `production_orders.orderId` unique per `source_type=ORDER` (`S/production/production-orders.ts:117`).
- Inventory: DO approval writes `inventory_issues.outboundOrderId` (DRAFT SALES issue) (`S/inventory/inventory-issues.ts:63`); `InventoryService` copies delivered/open-demand queries for AWAITING_PRODUCTION and IN_PROGRESS SO (`inventory/inventory.query.ts:92`); `OrdersService.getOrderItems` exposes `issuedQty`/`remainingQty` (unclamped).
- Quality: DO send reads `getJobQcCoverage`/`getJobFinalOperation` (`oqc/oqc.query.ts:213`, :112). NCR rows from OQC copy `orderId` from the JOB's LSX (`ncrs/ncrs.write.ts:69`); secondary LSX reuses it, E305 if missing (`ncrs.service.ts:347`).
- Items: SO and DO lines reference `items` with restrict FK; `outbound_order_items.productionJobId` is a display snapshot, set null if the JOB is deleted on LSX re-approval (`S/inventory/outbound-order-items.ts:35-40`).
- Others reading SO: `reports.service.ts`, `traces/traces.order.query.ts` (`GET /traces/order`, see `integration.md`), `orders-summary.service.ts` (value, overdue and progress summaries), payment-requests and purchase-orders modules (not read; unverified how).
