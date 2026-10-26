<!-- Generated: 2026-10-26 | Files scanned: 38 | Token estimate: ~3560 -->
# Inventory codemap

Single warehouse: `inventory_balances.itemId` is UNIQUE, no warehouse column (`src/database/schemas/inventory/inventory-balances.ts`).

## 1. Modules (`src/api/`, wc -l)

| Folder | Main files | Role |
|---|---|---|
| inventory | service 192, posting.service 133, inventory.query 116, item-stock.query 121, available-quantity.query 84 | Only ledger writer (`InventoryPostingService`) + raw reads; module exports both services |
| inventory-receipts | service 1375, write 189, query 76 | PNK receipts, IQC/OQC gates |
| inventory-issues | service 607 | PXK issues |
| inventory-requisitions | service 725, lines.service 218, query 237 | MR requisitions (DIRECT items), reservation maths |
| inventory-adjustments | service 377 | PDC adjustments |
| inventory-products | service 249, product-ledger.query 41 | FG stock list + stock card |
| inventory-directs | service 107 | DIRECT stock list |
| supplier-returns | service 515, query 38 | PTNCC returns to supplier |

Split: `*.service` = validation + orchestration. `*.write.ts` / `*.query.ts` = plain functions taking `tx`/`db` (no DI) so IQC/OQC/NCR modules call them without module cycles (`inventory-receipts.write.ts:82`, `supplier-returns.query.ts:15`). Issues, adjustments, requisitions write directly in the service. `inventory-documents.ts` holds only the shared status enum (no table). Code prefixes via `generateDocumentSequence`: PNK `inventory-receipts.write.ts:20`, PXK `inventory-issues.service.ts:451`, PDC `inventory-adjustments.service.ts:323`, MR/PXK `inventory-requisitions.service.ts:635`, PTNCC `supplier-returns.service.ts:502`.

## 2. Routes (43). Perm: R=inventory:read, C=inventory:create, U=inventory:update, D=inventory:delete

Controller file = `<folder>.controller.ts`; "Svc" = service line.

| Route | Perm | Controller.method -> Service.method (Svc) | Writes |
|---|---|---|---|
| GET /inventory/balances | R | getInventoryBalances -> InventoryService.getInventoryBalances (45) | - |
| GET /inventory/transactions | R | getInventoryTransactions -> getInventoryTransactions (98) | - |
| GET /inventory-receipts | R | getInventoryReceipts -> same (130) | - |
| GET /inventory-receipts/:receiptId | R | getInventoryReceipt -> same (323) | - |
| POST /inventory-receipts | C | createInventoryReceipt (426) | receipts, receipt_items |
| PATCH /inventory-receipts/:receiptId | U | updateInventoryReceipt (480), DRAFT only | receipts, receipt_items |
| DELETE /inventory-receipts/:receiptId | D | deleteInventoryReceipt (549), DRAFT, hard delete | receipts |
| POST .../:receiptId/confirm | U | confirmInventoryReceipt (559) | receipts, quality_inspections |
| POST .../:receiptId/post | U | postInventoryReceipt (642) | receipts, balances, transactions, payment_requests, production_jobs/orders(+logs), ncrs |
| POST .../:receiptId/cancel | U | cancelInventoryReceipt (860) | receipts, quality_inspections |
| GET .../:receiptId/export-pdf | R | exportInventoryReceiptPdf (266) | - |
| GET .../:receiptId/related-notes | R | PurchaseNotesService.getChainNotesFromReceipt | - |
| GET /inventory-issues | R | getInventoryIssues (91) | - |
| GET /inventory-issues/:issueId | R | getInventoryIssue (236), returns `postNote` + `files` | - |
| POST /inventory-issues | C | createInventoryIssue (264) | issues, issue_items |
| PATCH /inventory-issues/:issueId | U | updateInventoryIssue (291) | issues, issue_items |
| DELETE /inventory-issues/:issueId | D | deleteInventoryIssue (321) | issues |
| POST .../:issueId/post | U | postInventoryIssue (358), optional body `{note, fileIds}` (UploadType INVENTORY_ISSUE_EVIDENCE, `linkFiles` before the tx) | issues (`post_note`), inventory_issue_files, balances, transactions, requisitions |
| POST .../:issueId/cancel | U | cancelInventoryIssue (403) | issues, requisitions |
| GET /inventory-requisitions | inventory-requisitions:read | getInventoryRequisitions (72) | - |
| GET /inventory-requisitions/lines | :read | RequisitionLinesService.getRequisitionPickerLines (lines.service 109); declared before `:requisitionId` | - |
| GET .../:requisitionId | :read | getInventoryRequisition (150) | - |
| POST /inventory-requisitions | :create | createInventoryRequisition (185) | requisitions, requisition_items |
| PATCH .../:requisitionId | :update | updateInventoryRequisition (233); REJECTED reopens to DRAFT | requisitions, requisition_items |
| DELETE .../:requisitionId | :delete | deleteInventoryRequisition (270), DRAFT only | requisitions |
| POST .../:requisitionId/send | :update | sendInventoryRequisition (292) | requisitions |
| POST .../:requisitionId/approve | :approve | approveInventoryRequisition (318) | requisitions, issues, issue_items |
| POST .../:requisitionId/reject | :approve | rejectInventoryRequisition (374) | requisitions |
| POST .../:requisitionId/cancel | :update | cancelInventoryRequisition (455) | requisitions, issues |
| GET /inventory-adjustments | R | getInventoryAdjustments (47) | - |
| GET .../:adjustmentId | R | getInventoryAdjustment (100) | - |
| POST /inventory-adjustments | C | createInventoryAdjustment (122) | adjustments, adjustment_items |
| PATCH .../:adjustmentId | U | updateInventoryAdjustment (147) | adjustments, adjustment_items |
| DELETE .../:adjustmentId | D | deleteInventoryAdjustment (172) | adjustments |
| POST .../:adjustmentId/post | U | postInventoryAdjustment (183) | adjustments, balances, transactions |
| POST .../:adjustmentId/cancel | U | cancelInventoryAdjustment (236) | adjustments, balances, transactions (reversal) |
| GET /inventory-products | R | getInventoryProducts (62), FG ACTIVE | - |
| GET /inventory-products/:itemId/ledger | R | getProductLedger (138) | - |
| GET /inventory-directs | R | getInventoryDirects (38), DIRECT | - |
| GET /supplier-returns | R | getSupplierReturns (51) | - |
| GET /supplier-returns/:supplierReturnId | R | getSupplierReturn (194) | - |
| PATCH .../:supplierReturnId | U | updateSupplierReturn (233), DRAFT, note only | supplier_returns, quality_inspections(+_results).dispositionNote |
| POST .../:supplierReturnId/post | U | postSupplierReturn (336) | supplier_returns, supplier_return_files, balances, transactions, outsourcing_orders, production_job_operations, quality_inspections |

No supplier-return create/cancel route (DRAFT is born in `createFromIqcDisposition`, `supplier-returns.service.ts:286`). No requisition "issue" route: the PXK is created at approve.

## 3. State flows

Ledger (`inventory-posting.service.ts`): `postDocument` :47 loops `applyLine` :95: SELECT balance FOR UPDATE -> new qty < 0 throws E106 (:107) -> upsert `inventory_balances` -> INSERT `inventory_transactions` (append-only; referenceType + referenceId polymorphic, no FK). `reverseDocument` :66 re-reads transactions by reference and writes opposite-sign ADJUSTMENT_IN/OUT; used only by adjustment cancel. DB checks: balance qty >= 0; transaction sign must match type. Reference types: INVENTORY_RECEIPT/ISSUE/ADJUSTMENT, SUPPLIER_RETURN, plus legacy OUTSOURCING_ORDER/RECEIPT (outsourcing no longer posts stock).

Status enum (`inventory-documents.ts`): DRAFT, PENDING_IQC, IQC_COMPLETED, PENDING_RECEIPT, POSTED, CANCELLED. Receipt type -> ledger type (`receiptTypeTransactionType`, receipts.service:96): PURCHASE, RETURN, OTHER -> RECEIPT; PRODUCTION -> PRODUCTION_IN. Issue (`issues.service:54`): SALES, RETURN -> ISSUE; PRODUCTION -> PRODUCTION_OUT. Adjustment (`adjustments.service:32`): INCREASE -> ADJUSTMENT_IN, DECREASE -> ADJUSTMENT_OUT. No OUTSOURCING receipt type.

Receipt:
  DRAFT --confirm (559)--> PENDING_RECEIPT, or PENDING_IQC if requiresIqc (creates IQC via IqcService.createInspectionsFromReceipt, iqc.service.ts:404)
  PENDING_IQC <-> IQC_COMPLETED by `syncReceiptIqcStatus` (write.ts:146; called from iqc.service.ts:397/886/987 and iqc.write.ts:63)
  PENDING_RECEIPT | PENDING_IQC | IQC_COMPLETED --post (642)--> POSTED; IQC states need all IQC COMPLETED else E153 (1323). `buildReceiptPostingLines` (824) nets out POSTED supplier returns and drops lines <= 0.
  Not POSTED --cancel (860)--> CANCELLED (`cancelReceiptInspections`, iqc.write.ts:99, same tx: cancels all IQC of the receipt and its DRAFT supplier returns); POSTED = E289 (reverse through supplier return); a POSTED supplier return of this receipt = E290 (iqc.write.ts:114, checked before any cancel write)
  Confirm gates: PO ORDERED (1039); cumulative qty per PO line <= ordered (1118); PRODUCTION: `ensureProductionReceiptOqcCleared` (1182).
  Post side effects: PO linked -> `PaymentRequestsService.createIfOrderCompleted` (691); PRODUCTION with job -> `closeJobIfFullyReceived` (714).

### Production receipt and job closure
  OQC confirm (oqc.service.ts:627, per passed lot) or `closeJobIfQcCovered` (oqc.query.ts:277, job -> WAITING_DELIVERY)
   -> `createProductionReceiptForJob` (write.ts:82): inserts receipt straight at PENDING_RECEIPT for qty = target - confirmed PRODUCTION qty (idempotent; no DRAFT, no confirm step)
   -> warehouse `post` -> `closeJobIfFullyReceived`: job WAITING_DELIVERY and received + NCR-transferred qty (`getNcrTransferredQtyByJobId`, ncrs.query.ts:23) >= job.quantity -> job COMPLETED + job log -> all sibling JOBs COMPLETED -> LSX COMPLETED + log -> if ncrId `closeNcrIfProductionOrdersDone` (ncrs.write.ts:143). UPDATE guarded by `status = WAITING_DELIVERY` to avoid duplicate logs.

Issue: DRAFT --post (346)--> POSTED (PRODUCTION type needs no pending IQC else E203, `hasPendingIqcForItems` iqc.query.ts:23 (IQC CANCELLED by a cancelled source receipt does not count); sets linked requisition ISSUED); DRAFT --cancel (403)--> CANCELLED (cancels linked requisition). POSTED immutable. SALES issues linked to a DO (`outboundOrderId`) are created DRAFT by `OutboundOrdersService.approveOutboundOrder`; posting one (`postInventoryIssue`:378) delivers the DO and runs `closeOrdersIfFullyDelivered`, cancelling it (`cancelInventoryIssue`:487, needs `outbound:update` too) cancels the DO, and update/delete are blocked (E319).

Requisition (own enum, DIRECT items only):
  DRAFT --send (292)--> PENDING_APPROVAL --approve (318)--> APPROVED --PXK post--> ISSUED
  approve: locks balances (`getInventoryBalancesForUpdate`, item-stock.query.ts:15), revalidates, creates DRAFT PXK (`createIssueForRequisition` 406, PRODUCTION type), no ledger write
  PENDING_APPROVAL --reject (374)--> REJECTED --send or edit--> PENDING_APPROVAL/DRAFT
  cancel (455) from DRAFT/PENDING/APPROVED/REJECTED, also cancels the PXK. Only APPROVED holds stock (`HOLDING_STATUS`, requisitions.query.ts:16).

Adjustment: DRAFT --post (183)--> POSTED; DRAFT|POSTED --cancel (236)--> CANCELLED (POSTED -> `reverseDocument`).

Supplier return: IQC confirm with SORT/RETURN disposition (iqc.service.ts:840) -> DRAFT; IQC line waits IN_PROGRESS (`IqcStatus.WAITING_RETURN` in service code, label "Chờ trả NCC" in the export). `postSupplierReturn` (336) -> POSTED:
  1. `shouldPostStock` (460): ledger ISSUE (negative) unless origin is OS-IN or the source receipt is not yet POSTED.
  2. OS-IN origin: `recomputeAffectedOutsourcing` (413) -> `recomputeOutsourcingOrderStatus` (outsourcing-orders.query.ts:190) + `recomputeOutsourcedOperationProgress` (production-jobs.query.ts:106): returned qty is deducted from OS-IN received qty/quota, so OS-OUT status and operation completedQuantity can regress (COMPLETED -> PARTIAL/SENT).
  3. `completeIqcAfterSupplierReturn` (iqc.write.ts:32): IQC IN_PROGRESS -> COMPLETED, `syncReceiptIqcStatus`, `closeJobIfQcCovered`.
  Receipt side: `getReturnedQuantityByReceiptItemId` (supplier-returns.query.ts:15) sums POSTED returns to net the receipt post.

## 4. Key rules and errors (`src/constants/error-code.constant.ts`)

- Generic: E096 not found (receipts 342/1348, issues 247/569), E098 bad status transition (receipts 570/657/868/1370; issues 351/408/602), E100 item not found, E107 invalid reference (receipts 972/1203; issues 504/554), E106 insufficient stock, E137 supplier return not found (service 214/242/496).
- Receipt: E151 no lines (585); E152 IQC source unresolved (1318; OTHER exempt); E153 IQC not completed (1330); E154 over PO line qty (1161); E179 PRODUCTION needs productionJobId (1035); E196 OQC/IQC not cleared or qty > passed OQC (1219/1232/1235); E197 > job.quantity (1239); E209 final-assembly OQC missing (1223); E253 supplier xor client (1023); E289 POSTED not cancellable (873); E290 cancel blocked by a POSTED supplier return of the receipt (`cancelReceiptInspections`, iqc.write.ts:114); E293 OTHER needs reason, E294 OTHER forbids PO/supplier/client/job/PO line (1005/1014); E315 PO line with quotation unit needs quotationQuantity (1107); E121/E123/E127/E145 PO or PO line not found / mismatch / not ORDERED (1039-1093). `reason` saved only for OTHER and RETURN (`effectiveReason` 977).
- Issue: E203 pending IQC (363); E234 manual PRODUCTION issue (590); E235 deleting a PXK generated by a requisition (330).
- Requisition: E223 not found; E224 not editable/cancellable; E225 not PENDING_APPROVAL (332/389); E227 no lines (341); E228 duplicate item; E229 item not DIRECT; E230 item not in job BOM; E231 qty > on-hand minus held (615); E232 qty > remaining BOM (624); E233 PRODUCTION needs job (522); E087 job PENDING (575); E007 item not found. All line checks in `validateRequisitionLines` (535), run at create/update/approve.
- Adjustment: E261 duplicate item (308); E151 empty at post (202).
- Stock: available = onHand - held - remaining BOM demand (`stockSqlFragments`, available-quantity.query.ts:14); filter `StockStatus` NORMAL/WARNING/SHORTAGE (`inventory.constant.ts`). FG list reserved = outbound-order held qty (inventory-products.service.ts:62). Stock card `balanceAfter` = window sum over full history, date filter applied after (`product-ledger.query.ts:10`).
- Concurrency: post/cancel lock the document row FOR UPDATE (`getInventoryReceiptForUpdate` 1337 and siblings).

## 5. Cross-domain links

- purchase-orders: receipts need PO ORDERED; received qty = POSTED receipt lines (`getReceivedQuantityByPurchaseOrderItemId`, purchase-orders.query.ts:130); PO cancel cancels DRAFT receipts (`cancelLinkedDocuments`, purchase-orders.service.ts:773); payment-requests.service.ts:631 on post.
- iqc/oqc: IQC created at confirm; `getJobQcCoverage` (oqc.query.ts:213) and `getPassedOqcQuantityByJobId` (:173) gate PRODUCTION receipts. `IqcModule` imports `SupplierReturnsModule`; IQC/OQC avoid importing `InventoryReceiptsModule` (hence plain functions).
- production-jobs/orders/ncrs: `production_job_issues` = BOM demand for requisitions; receipt post closes JOB, LSX, NCR.
- outsourcing: supplier returns from OS-IN change OS-OUT status and operation progress; see outsourcing codemap (`outsourcing-*` schemas).
- outbound-orders: DO approval creates a DRAFT SALES issue (`inventory_issues.outboundOrderId`) that the warehouse posts; `outboundHeldQuantityByItemSubquery` feeds FG reserved; see outbound codemap.
