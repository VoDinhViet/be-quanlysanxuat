<!-- Generated: 2026-10-15 | Files scanned: 52 | Token estimate: ~3000 -->
# Purchasing codemap

Paths relative to `src/api/` unless starting `src/`. Abbreviations: PRS=`purchase-requests/purchase-requests.service.ts`, PQS=`purchase-quotations/purchase-quotations.service.ts`, POS=`purchase-orders/purchase-orders.service.ts`, PYS=`payment-requests/payment-requests.service.ts`, PLS=`purchase-ledger/purchase-ledger.service.ts`, PNS=`purchase-notes/purchase-notes.service.ts`, SUS=`suppliers/suppliers.service.ts`.

## 1. Modules (wc -l)

| Folder | Main files | Role |
|---|---|---|
| purchase-requests | service 803, controller 271 | Purchase request (ĐXMH) header + lines; exported to production-jobs |
| purchase-quotations | service 1056, controller 220, query 54 | RFQ: items, suppliers, allocations to request lines |
| purchase-orders | service 1205, controller 184, query 339, constant 13 | DMH; imports PaymentRequests; exported to quotations |
| purchase-notes | service 458, no controller | Reads notes along the chain; routes sit on 4 other controllers |
| purchase-ledger | service 365, controller 44, query 168 | Read-only per-request-line ledger + xlsx |
| payment-requests | service 1044, controller 237 | YCTT, 1:1 with DMH; exported to purchase-orders, inventory-receipts |
| suppliers / supplier-groups | 400+103 / 49+26 | Supplier master; group list |

Schemas `src/database/schemas/`: `purchase-requests/*` (2 tables), `purchasing/*` (quotations, items, item-suppliers, allocations, supplier-files, purchase-orders, purchase-order-items, payment-requests, payment-request-logs), `suppliers/*` (suppliers, supplier-payment-info, files, representatives, groups).

## 2. Routes (prefix `/api`; permission `purchasing:<x>` unless noted; writes mostly return void)

purchase-requests (14), `PurchaseRequestsController` -> PRS; perm `purchase-requests:<x>`:
- GET / read: getPurchaseRequests :91. GET /:id read: getPurchaseRequest :181 (lines :227).
- POST / create: createPurchaseRequest :687 [purchase_requests, purchase_request_items]. DELETE /:id delete: deletePurchaseRequest :494.
- POST /:id/send update :537; /approve approve :553; /reject approve :571 [purchase_requests].
- POST /:id/items update: createPurchaseRequestItems :275; PATCH /:id/items/:itemId update :308; DELETE same path update :339 [purchase_request_items].
- PATCH /:id/items/:itemId/purchasable update :376 [purchase_request_items.cancelledAt]. PATCH /:id/note :502; /needed-date :523 (update).
- GET /:id/related-notes read: PNS.getChainNotesFromRequest :37.

purchase-quotations (12) -> PQS:
- GET / read :79; GET /last-purchases read :300 (`purchase-quotations.query.ts:16`); GET /:id read :215; GET /:id/comparison read :235; GET /:id/related-notes read: PNS :60.
- POST / create :407; PATCH /:id update :429 (deletes and recreates items); DELETE /:id delete :459 [quotations, items, allocations, item_suppliers, item_supplier_files].
- POST /:id/send update :470; /approve approve :519 [item_suppliers.selected*, quotations, purchase_orders, purchase_order_items]; /reject approve :660; /cancel approve :683 [purchase_orders delete, quotations].

purchase-orders (9) -> POS:
- GET / read :99; GET /:id read :403; GET /:id/related-notes read: PNS :83.
- PATCH /:id update :582; PATCH /:id/items/:itemId update :667 (both PENDING_CONFIRMATION only).
- PATCH /:id/advance-payment update :603 [purchase_orders, payment_requests, logs].
- POST /:id/confirm update :702; /cancel approve :743 [purchase_orders, payment_requests+logs, inventory_receipts, purchase_quotations]; /close approve :913 [purchase_order_items, purchase_orders, payment_requests].

purchase-ledger (2) -> PLS, read: GET / :63; GET /export :196 (xlsx, silently capped 10,000 rows).

payment-requests (12) -> PYS:
- GET / read :127; GET /export read :213 (cap 10,000); GET /:id read :292; GET /:id/logs read :600.
- POST /:id/mark-paid approve :377; /send update :422; /reject approve :454; /cancel approve :406 [payment_requests, payment_request_logs].
- PATCH /:id/invoice update :551; /note update :568; /urgency update :585 [payment_requests]; /extra-cost update :489 [+logs].
- No create route and no separate approve route: `mark-paid` is the accountant confirmation.

suppliers (6) -> SUS, perm `suppliers:<x>`: GET / read :41; GET /stats read :96; GET /:id read :119; POST / create :142 and PATCH /:id update :191 (both return SupplierResDto; write suppliers, supplier_payment_info, supplier_files, supplier_representatives); DELETE /:id delete :241 (soft, 204).
supplier-groups (1): GET / -> `supplier-groups/supplier-groups.service.ts:18`; `@ApiPublic` applies `@Public()` (`src/decorators/http.decorators.ts:95`): no JWT, no permission.

## 3. State flows

Purchase request (`PurchaseRequestStatus`, `src/database/schemas/purchase-requests/purchase-requests.ts:18`):
  DRAFT --send PRS:537--> PENDING_APPROVAL --approve :553--> APPROVED
  PENDING_APPROVAL --reject :571--> REJECTED --send :537--> PENDING_APPROVAL
  REJECTED --edit/delete line or needed-date (ensurePurchaseRequestEditable :614)--> DRAFT
  Sources: hand-made :687 (DRAFT, no LSX/JOB); `createShortageRequest` :761, called by `production-jobs/production-jobs.service.ts:848` (startJob), carries LSX/JOB ids.

RFQ -> DMH (`PurchaseQuotationStatus` `purchasing/purchase-quotations.ts:14`, `PurchaseOrderStatus` `purchasing/purchase-orders.ts:20`):
  RFQ DRAFT --send PQS:470--> PENDING_APPROVAL --approve PQS:519--> APPROVED
       approve -> POS.createPendingOrdersFromQuotation :548: one DMH PENDING_CONFIRMATION per supplier (expectedDate = orderDate + max leadTime :1157)
  PENDING_APPROVAL --reject PQS:660--> REJECTED (terminal)
  APPROVED --cancelQuotation PQS:683--> CANCELLED (deletes pending DMH; blocked by any ORDERED DMH)
  APPROVED --revertQuotationToDraft POS:862 (cancel DMH with reopenQuotation)--> DRAFT
  DMH PENDING_CONFIRMATION --confirm POS:702--> ORDERED; either --cancel POS:743--> CANCELLED
  ORDERED + `closedAt` via closePurchaseOrder POS:913 (status stays ORDERED, lines cut to received qty)
  Receipt: create requires DMH ORDERED (`inventory-receipts/inventory-receipts.service.ts:1040`); post :643 -> PYS.createIfOrderCompleted.
  Derived, not stored: DMH progress `resolveOrderProgress` POS:346 (PENDING_CONFIRMATION, ORDERED, RECEIVING, COMPLETED, CANCELLED); ledger status `buildLedgerStatus` PLS:343 (WAITING_TO_PURCHASE, QUOTING, ORDERED, RECEIVING, COMPLETED).

Payment request (`PaymentRequestStatus` `purchasing/payment-requests.ts:20`; log actions `purchasing/payment-request-logs.ts:16`):
  auto-create: receipt POSTED and DMH ORDERED, paymentTerm set, ordered qty > 0, received >= ordered --createIfOrderCompleted PYS:631--> DRAFT (dueDate = orderDate + term days, PYS:68; unique 23505 swallowed :767; CANCELLED row revived to DRAFT :735)
  DRAFT|REJECTED --send PYS:422--> PENDING --mark-paid :377--> PAID
  PENDING --reject :454--> REJECTED (reason kept; buyer edits, resends)
  DRAFT|PENDING|REJECTED --cancel :406, cancelForOrder :930--> CANCELLED
  Gates: extra-cost :489 only DRAFT/REJECTED (requestedAmount = balanceDue + extraCost; PH-131); urgency :585 on non-final states (PH-133); invoice :551 and note :568 on any state except CANCELLED (PH-130, PH-132); all transitions via `transitionStatus` :981 (conditional UPDATE, loser gets E158).
  Amount `calculateSettledAmounts` :801: posted received qty (net of supplier returns; quotation-unit lines use billed quotation qty) x unitPrice + VAT + otherCost - advance (PH-135). Advance (PH-128): POS:603 -> `applyAdvancePayment` PYS:874.
  Ledger link: no FK; ledger and payment request both derive from purchase_order_items + posted receipts (`purchase-orders/purchase-orders.query.ts:74` vs `purchase-ledger/purchase-ledger.query.ts:41`).

Notes chain (PNS, read-only): purchase_requests - purchase_request_items - purchase_quotation_item_allocations - purchase_quotation_items - purchase_quotations; purchase_request_items - purchase_order_items - purchase_orders (quotationId); inventory_receipts (purchaseRequestId, purchaseOrderId) via `linkReceiptsAndRequestsOrOrders` :309; merged by `selectNotesByIds` :396. Entry :37/:60/:83/:103; receipt route is mounted in `inventory-receipts/inventory-receipts.controller.ts:176`.

## 4. Key rules and errors (`src/constants/error-code.constant.ts`)

- PR: line edits only DRAFT/REJECTED else E114 (PRS:614); approve/reject need PENDING_APPROVAL E116 (:668); last line E115 (:339); empty E146, duplicate E147, non-DIRECT item E148 (:729); line exists E287 (:275). Not-purchasable needs APPROVED E298, blocked by open DMH E125, by DRAFT/PENDING RFQ E299 (:376).
- RFQ: not found E117, wrong status E118 (PQS:1003). Allocations (:909): none E150, duplicate request line E128, line not APPROVED or cancelled E125, item mismatch E149, qty <= 0 E265. Supplier conflict E129 (:881), supplier missing E019. Send: no items E131, item without supplier E130, unit price missing E120. Approve needs one winner per item E132 (:783; DB partial unique index on selected_at). Cancel blocked by ORDERED DMH E133. Quotation qty split by allocation ratio :1032.
- DMH: not found E121; not PENDING_CONFIRMATION, double cancel, close on non-ORDERED/closed E122 (POS:1079, :1098, :962); line E123; confirm needs expectedDate E134, paymentTerm E156, all unitPrice E135 (:702); assignee E136; cancel with POSTED receipt E124; reopen blocked E133; close with unposted receipts E285, nothing to close E286; advance on CANCELLED E313, over total E312, PENDING request E317, PAID request E284; quotationQuantity without unit E316.
- Payment request: not found E157, status mismatch E158, PAID blocks cancelForOrder/advance E284. Lines are read from purchase_order_items, no own item table.
- Receipt side: DMH must be ORDERED E145; line/DMH mismatch E127; POSTED receipt cannot be cancelled E289, so `cancelForOrder` runs only from DMH cancel (POS:773).
- Ledger: only APPROVED requests, lines with cancelledAt null; ordered counts ORDERED DMH only (`purchase-ledger.query.ts:20`); quoted skips REJECTED/CANCELLED RFQs and uses live DMH qty for APPROVED RFQs (:108). Comment at `purchase-ledger.service.ts:54` says PO `DRAFT` (stale; enum is PENDING_CONFIRMATION). E126 retired.
- Suppliers: code E020, tax code E022, group E021, country E023; delete blocked E247 when referenced by purchase_orders, quotation item_suppliers, outsourcing orders/receipts or supplier_returns (SUS:253). Files linked before the transaction (:281).
- Codes PR-, RFQ-, DMH-, YCTT- via `generateDocumentSequence` (`src/common/utils/document-sequence.util`).

## 5. Cross-domain links

- inventory-receipts: nullable FKs purchaseRequestId/purchaseOrderId; post calls PYS.createIfOrderCompleted (`inventory-receipts.service.ts:691`); DMH cancel sets DRAFT receipts CANCELLED (POS:785); DMH close deletes unreceived lines (receipt FK set null); open receipts = DRAFT, PENDING_RECEIPT, PENDING_IQC, IQC_COMPLETED (`findUnpostedReceipts` POS:1059).
- iqc: `quality_inspections.supplierId/purchaseOrderId` (`iqc/iqc.service.ts:82`); POSTED `supplier_returns` reduce received qty in DMH, ledger and payment amounts.
- items/units: request lines join items (DIRECT only), units, files, stock via `inventory/item-stock.query` and `inventory/available-quantity.query` (PRS:227).
- production: purchase_requests.productionOrderId/productionJobId; ledger joins production_orders and orders.buyerPoNo.
- suppliers: purchase_orders.supplierId and item_suppliers.supplierId are restrict FKs; `PaymentTerm` enum in `src/database/schemas/suppliers/supplier-payment-info.ts:24` also types purchase_orders.paymentTerm (supplier-to-DMH term copy: unverified).

Unverified: `drizzle/` migrations, DTO fields, Swagger status codes; receipts and iqc only grepped for purchasing touchpoints.
