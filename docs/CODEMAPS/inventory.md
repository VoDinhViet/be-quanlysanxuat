<!-- Generated: 2026-10-15 | Files scanned: 38 | Token estimate: ~3500 -->
# Inventory codemap

Single warehouse: `inventory_balances.itemId` is UNIQUE, no warehouse column (`src/database/schemas/inventory/inventory-balances.ts`). Source comments also cite `docs/domains/inventory.md` (not verified to exist).

## 1. Modules (`src/api/`, wc -l)

| Folder | Main files | Role |
|---|---|---|
| inventory | service 195, posting.service 134, inventory.query 117, item-stock.query 121, available-quantity.query 83 | Only ledger writer (`InventoryPostingService`) + raw reads; module exports both services |
| inventory-receipts | service 1382, write 188, query 77 | PNK receipts, IQC/OQC gates |
| inventory-issues | service 608 | PXK issues |
| inventory-requisitions | service 727, lines.service 221, query 241 | MR requisitions (DIRECT items), reservation maths |
| inventory-adjustments | service 380 | PDC adjustments |
| inventory-products | service 250, product-ledger.query 41 | FG stock list + stock card |
| inventory-directs | service 109 | DIRECT stock list |
| supplier-returns | service 517, query 40 | PTNCC returns to supplier |

Split: `*.service` = validation + orchestration. `*.write.ts` / `*.query.ts` = plain functions taking `tx`/`db` (no DI) so IQC/OQC/NCR modules call them without module cycles (`inventory-receipts.write.ts:81`, `supplier-returns.query.ts:17`). Issues, adjustments, requisitions write directly in the service. `inventory-documents.ts` holds only the shared status enum (no table). Code prefixes via `generateDocumentSequence`: PNK `inventory-receipts.write.ts:20`, PXK `inventory-issues.service.ts:453`, PDC `inventory-adjustments.service.ts:326`, MR/PXK `inventory-requisitions.service.ts:634`, PTNCC `supplier-returns.service.ts:504`.

## 2. Routes (43). Perm: R=inventory:read, C=inventory:create, U=inventory:update, D=inventory:delete

Controller file = `<folder>.controller.ts`; "Svc" = service line.

| Route | Perm | Controller.method -> Service.method (Svc) | Writes |
|---|---|---|---|
| GET /inventory/balances | R | getInventoryBalances -> InventoryService.getInventoryBalances (47) | - |
| GET /inventory/transactions | R | getInventoryTransactions -> getInventoryTransactions (101) | - |
| GET /inventory-receipts | R | getInventoryReceipts -> same (131) | - |
| GET /inventory-receipts/:receiptId | R | getInventoryReceipt -> same (326) | - |
| POST /inventory-receipts | C | createInventoryReceipt (432) | receipts, receipt_items |
| PATCH /inventory-receipts/:receiptId | U | updateInventoryReceipt (486), DRAFT only | receipts, receipt_items |
| DELETE /inventory-receipts/:receiptId | D | deleteInventoryReceipt (555), DRAFT, hard delete | receipts |
| POST .../:receiptId/confirm | U | confirmInventoryReceipt (566) | receipts, quality_inspections |
| POST .../:receiptId/post | U | postInventoryReceipt (644) | receipts, balances, transactions, payment_requests, production_jobs/orders(+logs), ncrs |
| POST .../:receiptId/cancel | U | cancelInventoryReceipt (861) | receipts, quality_inspections |
| GET .../:receiptId/export-pdf | R | exportInventoryReceiptPdf (269) | - |
| GET .../:receiptId/related-notes | R | PurchaseNotesService.getChainNotesFromReceipt | - |
| GET /inventory-issues | R | getInventoryIssues (91) | - |
| GET /inventory-issues/:issueId | R | getInventoryIssue (233) | - |
| POST /inventory-issues | C | createInventoryIssue (265) | issues, issue_items |
| PATCH /inventory-issues/:issueId | U | updateInventoryIssue (292) | issues, issue_items |
| DELETE /inventory-issues/:issueId | D | deleteInventoryIssue (322) | issues |
| POST .../:issueId/post | U | postInventoryIssue (346) | issues, balances, transactions, requisitions |
| POST .../:issueId/cancel | U | cancelInventoryIssue (405) | issues, requisitions |
| GET /inventory-requisitions | inventory-requisitions:read | getInventoryRequisitions (72) | - |
| GET /inventory-requisitions/lines | :read | RequisitionLinesService.getRequisitionPickerLines (lines.service 110); declared before `:requisitionId` | - |
| GET .../:requisitionId | :read | getInventoryRequisition (150) | - |
| POST /inventory-requisitions | :create | createInventoryRequisition (185) | requisitions, requisition_items |
| PATCH .../:requisitionId | :update | updateInventoryRequisition (234); REJECTED reopens to DRAFT | requisitions, requisition_items |
| DELETE .../:requisitionId | :delete | deleteInventoryRequisition (271), DRAFT only | requisitions |
| POST .../:requisitionId/send | :update | sendInventoryRequisition (293) | requisitions |
| POST .../:requisitionId/approve | :approve | approveInventoryRequisition (317) | requisitions, issues, issue_items |
| POST .../:requisitionId/reject | :approve | rejectInventoryRequisition (373) | requisitions |
| POST .../:requisitionId/cancel | :update | cancelInventoryRequisition (456) | requisitions, issues |
| GET /inventory-adjustments | R | getInventoryAdjustments (48) | - |
| GET .../:adjustmentId | R | getInventoryAdjustment (101) | - |
| POST /inventory-adjustments | C | createInventoryAdjustment (123) | adjustments, adjustment_items |
| PATCH .../:adjustmentId | U | updateInventoryAdjustment (148) | adjustments, adjustment_items |
| DELETE .../:adjustmentId | D | deleteInventoryAdjustment (173) | adjustments |
| POST .../:adjustmentId/post | U | postInventoryAdjustment (185) | adjustments, balances, transactions |
| POST .../:adjustmentId/cancel | U | cancelInventoryAdjustment (239) | adjustments, balances, transactions (reversal) |
| GET /inventory-products | R | getInventoryProducts (63), FG ACTIVE | - |
| GET /inventory-products/:itemId/ledger | R | getProductLedger (139) | - |
| GET /inventory-directs | R | getInventoryDirects (40), DIRECT | - |
| GET /supplier-returns | R | getSupplierReturns (51) | - |
| GET /supplier-returns/:supplierReturnId | R | getSupplierReturn (194) | - |
| PATCH .../:supplierReturnId | U | updateSupplierReturn (233), DRAFT, note only | supplier_returns, quality_inspections(+_results).dispositionNote |
| POST .../:supplierReturnId/post | U | postSupplierReturn (332) | supplier_returns, supplier_return_files, balances, transactions, outsourcing_orders, production_job_operations, quality_inspections |

No supplier-return create/cancel route (DRAFT is born in `createFromIqcDisposition`, `supplier-returns.service.ts:286`). No requisition "issue" route: the PXK is created at approve.

## 3. State flows

Ledger (`inventory-posting.service.ts`): `postDocument` :48 loops `applyLine` :96: SELECT balance FOR UPDATE -> new qty < 0 throws E106 (:108) -> upsert `inventory_balances` -> INSERT `inventory_transactions` (append-only; referenceType + referenceId polymorphic, no FK). `reverseDocument` :67 re-reads transactions by reference and writes opposite-sign ADJUSTMENT_IN/OUT; used only by adjustment cancel. DB checks: balance qty >= 0; transaction sign must match type. Reference types: INVENTORY_RECEIPT/ISSUE/ADJUSTMENT, SUPPLIER_RETURN, plus legacy OUTSOURCING_ORDER/RECEIPT (outsourcing no longer posts stock).

Status enum (`inventory-documents.ts`): DRAFT, PENDING_IQC, IQC_COMPLETED, PENDING_RECEIPT, POSTED, CANCELLED. Receipt type -> ledger type (`receiptTypeTransactionType`, receipts.service:97): PURCHASE, RETURN, OTHER -> RECEIPT; PRODUCTION -> PRODUCTION_IN. Issue (`issues.service:54`): SALES, RETURN -> ISSUE; PRODUCTION -> PRODUCTION_OUT. Adjustment (`adjustments.service:33`): INCREASE -> ADJUSTMENT_IN, DECREASE -> ADJUSTMENT_OUT. No OUTSOURCING receipt type.

Receipt:
  DRAFT --confirm (566)--> PENDING_RECEIPT, or PENDING_IQC if requiresIqc (creates IQC via IqcService.createInspectionsFromReceipt, iqc.service.ts:406)
  PENDING_IQC <-> IQC_COMPLETED by `syncReceiptIqcStatus` (write.ts:145; called from iqc.service.ts:398/890/991 and iqc.write.ts:61)
  PENDING_RECEIPT | PENDING_IQC | IQC_COMPLETED --post (644)--> POSTED; IQC states need all IQC COMPLETED else E153 (1330). `buildReceiptPostingLines` (824) nets out POSTED supplier returns and drops lines <= 0.
  Not POSTED --cancel (861)--> CANCELLED (`cancelReceiptInspections`, iqc.write.ts:98); POSTED = E289 (reverse through supplier return)
  Confirm gates: PO ORDERED (1043); cumulative qty per PO line <= ordered (1124); PRODUCTION: `ensureProductionReceiptOqcCleared` (1186).
  Post side effects: PO linked -> `PaymentRequestsService.createIfOrderCompleted` (692); PRODUCTION with job -> `closeJobIfFullyReceived` (717).

Production receipt and job closure:
  OQC confirm (oqc.service.ts:628, per passed lot) or `closeJobIfQcCovered` (oqc.query.ts:279, job -> WAITING_DELIVERY)
   -> `createProductionReceiptForJob` (write.ts:81): inserts receipt straight at PENDING_RECEIPT for qty = target - confirmed PRODUCTION qty (idempotent; no DRAFT, no confirm step)
   -> warehouse `post` -> `closeJobIfFullyReceived`: job WAITING_DELIVERY and received + NCR-transferred qty (`getNcrTransferredQtyByJobId`, ncrs.query.ts:15) >= job.quantity -> job COMPLETED + job log -> all sibling JOBs COMPLETED -> LSX COMPLETED + log -> if ncrId `closeNcrIfProductionOrdersDone` (ncrs.write.ts:143). UPDATE guarded by `status = WAITING_DELIVERY` to avoid duplicate logs.

Issue: DRAFT --post (346)--> POSTED (PRODUCTION type needs no pending IQC else E203, `hasPendingIqcForItems` iqc.query.ts:18; sets linked requisition ISSUED); DRAFT --cancel (405)--> CANCELLED (cancels linked requisition). POSTED immutable. SALES issues are also auto-posted by `OutboundOrdersService.postOutboundOrder` (outbound-orders.service.ts:748).

Requisition (own enum, DIRECT items only):
  DRAFT --send (293)--> PENDING_APPROVAL --approve (317)--> APPROVED --PXK post--> ISSUED
  approve: locks balances (`getInventoryBalancesForUpdate`, item-stock.query.ts:15), revalidates, creates DRAFT PXK (`createIssueForRequisition` 407, PRODUCTION type), no ledger write
  PENDING_APPROVAL --reject (373)--> REJECTED --send or edit--> PENDING_APPROVAL/DRAFT
  cancel (456) from DRAFT/PENDING/APPROVED/REJECTED, also cancels the PXK. Only APPROVED holds stock (`HOLDING_STATUS`, requisitions.query.ts:16).

Adjustment: DRAFT --post (185)--> POSTED; DRAFT|POSTED --cancel (239)--> CANCELLED (POSTED -> `reverseDocument`).

Supplier return: IQC confirm with SORT/RETURN disposition (iqc.service.ts:844) -> DRAFT; IQC line waits IN_PROGRESS. `postSupplierReturn` (332) -> POSTED:
  1. `shouldPostStock` (461): ledger ISSUE (negative) unless origin is OS-IN or the source receipt is not yet POSTED.
  2. OS-IN origin: `recomputeAffectedOutsourcing` (412) -> `recomputeOutsourcingOrderStatus` (outsourcing-orders.query.ts:193) + `recomputeOutsourcedOperationProgress` (production-jobs.query.ts:105): returned qty is deducted from OS-IN received qty/quota, so OS-OUT status and operation completedQuantity can regress (COMPLETED -> PARTIAL/SENT).
  3. `completeIqcAfterSupplierReturn` (iqc.write.ts:30): IQC IN_PROGRESS -> COMPLETED, `syncReceiptIqcStatus`, `closeJobIfQcCovered`.
  Receipt side: `getReturnedQuantityByReceiptItemId` (supplier-returns.query.ts:17) sums POSTED returns to net the receipt post.

## 4. Key rules and errors (`src/constants/error-code.constant.ts`)

- Generic: E096 not found (receipts 345/1355, issues 248/571), E098 bad status transition (receipts 577/659/869/1377; issues 351/410/603), E100 item not found, E107 invalid reference (receipts 974/1207; issues 506/556), E106 insufficient stock, E137 supplier return not found (service 214/242/498).
- Receipt: E151 no lines (591); E152 IQC source unresolved (1325; OTHER exempt); E153 IQC not completed (1337); E154 over PO line qty (1167); E179 PRODUCTION needs productionJobId (1039); E196 OQC/IQC not cleared or qty > passed OQC (1223/1236/1239); E197 > job.quantity (1243); E209 final-assembly OQC missing (1227); E253 supplier xor client (1025); E289 POSTED not cancellable (874); E293 OTHER needs reason, E294 OTHER forbids PO/supplier/client/job/PO line (1007/1016); E315 PO line with quotation unit needs quotationQuantity (1111); E121/E123/E127/E145 PO or PO line not found / mismatch / not ORDERED (1043-1097). `reason` saved only for OTHER and RETURN (`effectiveReason` 979).
- Issue: E203 pending IQC (363); E234 manual PRODUCTION issue (591); E235 deleting a PXK generated by a requisition (331).
- Requisition: E223 not found; E224 not editable/cancellable; E225 not PENDING_APPROVAL (331/388); E227 no lines (340); E228 duplicate item; E229 item not DIRECT; E230 item not in job BOM; E231 qty > on-hand minus held (614); E232 qty > remaining BOM (623); E233 PRODUCTION needs job (523); E087 job PENDING (574); E007 item not found. All line checks in `validateRequisitionLines` (534), run at create/update/approve.
- Adjustment: E261 duplicate item (311); E151 empty at post (204).
- Stock: available = onHand - held - remaining BOM demand (`stockSqlFragments`, available-quantity.query.ts:13); filter `StockStatus` NORMAL/WARNING/SHORTAGE (`inventory.constant.ts`). FG list reserved = outbound-order held qty (inventory-products.service.ts:63). Stock card `balanceAfter` = window sum over full history, date filter applied after (`product-ledger.query.ts:10`).
- Concurrency: post/cancel lock the document row FOR UPDATE (`getInventoryReceiptForUpdate` 1344 and siblings).

## 5. Cross-domain links

- purchase-orders: receipts need PO ORDERED; received qty = POSTED receipt lines (`getReceivedQuantityByPurchaseOrderItemId`, purchase-orders.query.ts:130); PO cancel cancels DRAFT receipts (`cancelLinkedDocuments`, purchase-orders.service.ts:773); payment-requests.service.ts:631 on post.
- iqc/oqc: IQC created at confirm; `getJobQcCoverage` (oqc.query.ts:215) and `getPassedOqcQuantityByJobId` (:168) gate PRODUCTION receipts. `IqcModule` imports `SupplierReturnsModule`; IQC/OQC avoid importing `InventoryReceiptsModule` (hence plain functions).
- production-jobs/orders/ncrs: `production_job_issues` = BOM demand for requisitions; receipt post closes JOB, LSX, NCR.
- outsourcing: supplier returns from OS-IN change OS-OUT status and operation progress; see outsourcing codemap (`outsourcing-*` schemas).
- outbound-orders: DO delivery creates a POSTED SALES issue (`inventory_issues.outboundOrderId`); `outboundHeldQuantityByItemSubquery` feeds FG reserved; see outbound codemap.
