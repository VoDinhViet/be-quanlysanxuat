<!-- Generated: 2026-10-26 | Files scanned: 27 | Token estimate: ~3530 -->
# Production codemap

Paths relative to `src/api/` unless starting `database/` or `constants/`. `ctrl:N`/`svc:N` = line in that domain's controller/service (`po.svc`, `jobs.svc`, `exec svc`, `OO svc`, `OR svc` = the five services). Create/update routes return 204 unless noted.

## 1. Modules

| Folder | Files (lines) | Role |
|---|---|---|
| production-orders | ctrl 180, svc 774, export 49, dto/ | LSX header + plan lines, approve, logs, Excel/PDF. No query/write file: SQL inline in svc |
| production-jobs | ctrl 338, svc 1052, `production-job-snapshot.query.ts` 536, `production-jobs.query.ts` 216, `production-job-issues.query.ts` 195, dto/ | JOB read/plan/start. snapshot.query builds BOM/ops/issues; jobs.query has close helpers; issues.query edits materials |
| production-execution | ctrl 136, svc 645, constant 30, dto/ | "Thuc hien san xuat" screens; only manual progress writer. No query file |
| outsourcing-orders | ctrl 118, svc 489, `outsourcing-orders.query.ts` 327, dto/ | OS-OUT (send out); query holds `recomputeOutsourcingOrderStatus` |
| outsourcing-receipts | ctrl 112, svc 695, `outsourcing-receipts.query.ts` 155, dto/ | OS-IN (receive back); query = received-qty subqueries |

No `*.write.ts` here; write helpers sit in `ncrs/ncrs.write.ts`, `iqc/iqc.write.ts`, `inventory-receipts/inventory-receipts.write.ts`. Schemas: `database/schemas/production/*` (13 files) and `database/schemas/inventory/outsourcing-{orders,order-items,receipts,receipt-items}.ts`.

## 2. Routes (44)

Tables: `po`=production_orders, `poi`=_order_items, `pol`=_order_logs, `pj`=production_jobs, `pjo`=_job_operations, `pjl`=_job_logs.

### production-orders (9) `/production-orders` perm prefix `production:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getProductionOrders ctrl:45 -> svc:93 | - |
| GET /export | read | exportProductionOrders ctrl:59 -> svc:155 (10,000-row cap) | - |
| GET /:productionOrdersId | read | getProductionOrdersById ctrl:71 -> svc:209 | - |
| GET /:id/export-pdf | read | exportProductionOrderPdf ctrl:85 -> svc:250 | - |
| PATCH /:id | update | updateProductionOrder ctrl:100 -> svc:335 (returns detail DTO) | poi, pol |
| PATCH /:id/note | update | updateProductionOrderNote ctrl:118 -> svc:728 | po.note, pol |
| PATCH /:id/signed-file | update | updateProductionOrderSignedFile ctrl:136 -> svc:687 (returns detail) | po.signedFileId, pol |
| GET /:id/logs | read | getProductionOrderLogs ctrl:155 -> svc:654 | - |
| POST /:id/approve | approve | approveProductionOrder ctrl:171 -> svc:434 (returns detail) | po, orders.status, pj + snapshot tables, pjl, pol |

### production-jobs (18) `/production-jobs` perm prefix `production:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getProductionJobs ctrl:62 -> svc:178 | - |
| GET /stats | read | getProductionJobStats ctrl:76 -> svc:245 (counts per status; same filters as GET / minus status, shared `buildProductionJobFilter`) | - |
| GET /export-plan-pdf | read | exportProductionPlanPdf ctrl:89 -> svc:114 | - |
| GET /:jobId | read | getProductionJob ctrl:101 -> svc:275 (+oqc.query.ts:153; `productFiles` = item_files of the Job's item revision) | - |
| GET /:jobId/bom | read | getProductionJobBom ctrl:114 -> svc:342 | - |
| GET /:jobId/operations | read | getProductionJobOperations ctrl:132 -> svc:442 (ctrl asserts operation access if `operationId`) | - |
| GET /:jobId/notes | read | getProductionJobNotes ctrl:155 -> svc:675 | - |
| GET /:jobId/logs | read | getProductionJobLogs ctrl:170 -> svc:701 | - |
| POST /:jobId/notes | update | createProductionJobNote ctrl:183 -> svc:499 | production_job_notes |
| POST /:jobId/bom | update | addIssues ctrl:202 -> svc:798 -> addJobIssues issues.query:26 | production_job_issues, job items/units, pjl (ITEMS_EDITED), pj.snapshotEditedAt |
| PATCH /:jobId/bom/:issueId | update | updateIssue ctrl:216 -> svc:809 -> updateJobIssue issues.query:112 | same as above |
| DELETE /:jobId/bom/:issueId | update | removeIssue ctrl:236 -> svc:821 -> removeJobIssue issues.query:136 | same as above |
| POST /:jobId/snapshot | update | reloadSnapshot ctrl:255 -> svc:776 | delete+insert job bom items/operations/issues, pj.snapshotLoadedAt, pj.snapshotEditedAt (null), pj.itemRevision |
| POST /:jobId/start | update | startJob ctrl:266 -> svc:846 | pj, pjl, purchase_requests (via `PurchaseRequestsService.createShortageRequest`) |
| GET /:jobId/operations/plan | read | getProductionJobPlanOperations ctrl:281 -> svc:543 | - |
| PATCH /:jobId/operations/plan | update | updateProductionJobOperationsPlan ctrl:294 -> svc:640 | pjo.dueDate |
| PATCH /:jobId/operations/:jobOperationId/due-date | update | updateProductionJobOperationDueDate ctrl:311 -> svc:518 | pjo.dueDate |
| POST /:jobId/qc | oqc:create | requestJobQc ctrl:331 -> `OqcService.createOqcForJob` oqc/oqc.service.ts:470 | quality_inspections (one DRAFT OQC row, `ncrId` null, inserted in a tx) + document_sequences (OQC code via `generateOqcCode`) |

### production-execution (6) `/production-execution` perm prefix `production-execution:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET /operations | read | getOperations ctrl:37 -> svc:84 | - |
| GET /jobs | read | getJobs ctrl:52 -> svc:194 | - |
| GET /jobs/:productionJobId | read | getJob ctrl:66 -> svc:348 (builds from `getProductionJobRecord`, so it carries `productFiles` too) | - |
| GET /jobs/:productionJobId/operations | read | getJobOperations ctrl:86 -> svc:371 | - |
| GET /jobs/:productionJobId/reports | read | getJobOperationReports ctrl:106 -> svc:405 | - |
| POST /operations/:jobOperationId/reports | report | createJobOperationReport ctrl:125 -> svc:479 | production_job_operation_reports(+_files), pjo, pj.status+pjl via `closeJobIfFinalAssemblyDone` |

### outsourcing-orders (13) `/outsourcing-orders` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingOrders ctrl:35 -> svc:62 | - |
| GET /outsourceable-operations | read | getOutsourceableOperations ctrl:49 -> svc:231 | - |
| GET /:outsourcingOrderId | read | getOutsourcingOrder ctrl:67 -> svc:120 | - |
| GET /:id/items | read | getOrderItems ctrl:82 -> svc:173 | - |
| POST / | create | createOutsourcingOrder -> creates a `DRAFT` (204) | outsourcing_orders, outsourcing_order_items |
| POST /standalone | create | createStandaloneOutsourcingOrder (DRAFT, `origin` MANUAL, no Job, no quota check; operation must be OUTSOURCE + ACTIVE) | outsourcing_orders, outsourcing_order_items (`unitId` per line) |
| PATCH /:id/standalone | update | updateStandaloneOutsourcingOrder (DRAFT/REJECTED, origin MANUAL only) | outsourcing_orders, outsourcing_order_items (replaced) |
| PATCH /:id | update | updateOutsourcingOrder (DRAFT/REJECTED, origin FROM_JOB only) | outsourcing_orders, outsourcing_order_items (replaced) |
| POST /:id/submit | update | submitOutsourcingOrder | status, submittedBy/At, clears rejectionReason |
| POST /:id/approve | approve | approveOutsourcingOrder | status, approvedBy/At |
| POST /:id/reject | approve | rejectOutsourcingOrder (reason required) | status, rejectedBy/At, rejectionReason |
| POST /:id/confirm-send | update | confirmSendOutsourcingOrder | status SENT, postedBy/At |
| POST /:id/cancel | update | cancelOutsourcingOrder | outsourcing_orders.status |

### outsourcing-receipts (6) `/outsourcing-receipts` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingReceipts ctrl:33 -> svc:90 | - |
| GET /pending-order-items | read | getPendingOrderItems ctrl:47 -> svc:250 | - |
| GET /:outsourcingReceiptId | read | getOutsourcingReceipt ctrl:59 -> svc:179 | - |
| GET /:id/items | read | getReceiptItems ctrl:74 -> svc:200 | - |
| POST / | create | createOutsourcingReceipt ctrl:89 -> svc:355 | outsourcing_receipts(+items), quality_inspections (IQC, via `IqcService.createInspectionsFromOutsourcingReceipt`, only if `requiresIqc`), outsourcing_orders.status, pjo progress |
| POST /:id/cancel | update | cancelOutsourcingReceipt ctrl:105 -> svc:445 | outsourcing_receipts.status, outsourcing_orders.status, pjo progress |

## 3. State flows

LSX (`database/schemas/production/production-orders.ts:27`: PENDING, APPROVED, COMPLETED)

  orders.approveOrder (orders/orders.service.ts:729) -> getInitialPlanItems po.svc:547 + seedPlan po.svc:610
     PENDING --updateProductionOrder svc:335 (qty edit, PENDING only)
        | approveProductionOrder svc:434 (orders AWAITING_PRODUCTION -> IN_PROGRESS)
        +-- any line qty>0 --> APPROVED (+createJobs jobs.svc:705, 1 JOB per itemId)
        +-- all qty 0 (100% from stock) --> COMPLETED directly (log COMPLETED)
     APPROVED --all sibling JOBs COMPLETED--> COMPLETED
        (closeJobIfFullyReceived inventory-receipts.service.ts:793; no manual route)

  NCR secondary LSX: NcrsService.createProductionOrder ncrs/ncrs.service.ts:337 (NCR status APPROVED|IN_PROGRESS)
     insert directly APPROVED, sourceType=NCR, ncrId+ncrAction (REWORK|REMAKE), same orderId, 1 JOB, NCR -> IN_PROGRESS
     REWORK: qty=ncr.reworkQty, snapshot via `ReworkSnapshotOptions` (snapshot.query:105): only chosen ops + last FG op, issues []
     REMAKE: qty=ncr.remakeQty, normal snapshot
     Marker: `production_orders.ncrAction` is exposed as `ncrAction` (null for normal LSX) on GET /production-jobs,
     GET /production-execution/jobs and GET /oqc rows; the plan PDF (`exportProductionPlanPdf`, template
     `production-plan.html`) adds a red "(sửa chữa)"/"(làm mới)" line under the PO cell and a red left edge
     LSX COMPLETED -> closeNcrIfProductionOrdersDone (ncrs/ncrs.write.ts:143, called inventory-receipts.service.ts:808):
     closes NCR (IN_PROGRESS -> closed) when COMPLETED LSX count >= (reworkQty>0)+(remakeQty>0)

JOB (`production-jobs.ts:26`: PENDING, IN_PROGRESS, WAITING_QC, WAITING_DELIVERY, COMPLETED; no manual route past start)

  createJobs jobs.svc:705 (+createJobSnapshot snapshot.query:133)
     PENDING --reloadSnapshot svc:749 / addIssues svc:771 / updateIssue / removeIssue (PENDING only)
        | startJob svc:819 (lock :825; shortage -> purchase request :860)
     IN_PROGRESS --report ops (exec svc:479) / OS-IN recompute (jobs.query:106)
        | closeJobIfFinalAssemblyDone jobs.query:27 (no FG op pending; callers exec svc:595, jobs.query:214)
     WAITING_QC --createOqcForJob oqc.service:470 allowed from IN_PROGRESS or WAITING_QC (E175)
        | closeJobIfQcCovered oqc/oqc.query.ts:277
        |   gate: coverage.total>0, open==0 (getJobQcCoverage :213), countPendingJobOperations==0 (jobs.query:80), final qty inspected (:340)
        |   then createProductionReceiptForJob (inventory-receipts.write.ts:82)
        |   callers: confirmOqc oqc.service:636, confirmIqc iqc.service:798, completeIqcAfterSupplierReturn iqc.write.ts:68
     WAITING_DELIVERY --postInventoryReceipt inventory-receipts.service.ts:642 (PRODUCTION receipt, :698)
        | closeJobIfFullyReceived :714: received + NCR-transferred (ncrs.query.ts:23) >= job.quantity
     COMPLETED (completedBy/At) -> if all sibling JOBs COMPLETED -> LSX COMPLETED (:793) -> closeNcrIfProductionOrdersDone (if ncrId)

Close chain: closeJobIfQcCovered -> closeJobIfFullyReceived -> LSX COMPLETED -> closeNcrIfProductionOrdersDone.

Outsourcing order (`origin` FROM_JOB | MANUAL; `database/schemas/inventory/outsourcing-orders.ts`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, SENT, PARTIAL, WAITING_QC, COMPLETED, CANCELLED; the first four are the approval flow, the rest = state + receive progress)

  create --> DRAFT (quota check E184) ; update (DRAFT/REJECTED only) ; submit DRAFT/REJECTED --> PENDING_APPROVAL (needs `outsourcing:update`)
  approve PENDING_APPROVAL --> APPROVED ; reject PENDING_APPROVAL --> REJECTED + reason (both need `outsourcing:approve`)
  confirm-send APPROVED --> SENT (needs `outsourcing:update`); only SENT and later can be received (OS-IN, E171 otherwise)
  every transition is a conditional UPDATE (`transitionStatus`), the loser of a race gets E098
  `recomputeOutsourcingOrderStatus` (outsourcing-orders.query.ts, same tx; touches only `RECEIVING_STATUSES`: SENT/PARTIAL/WAITING_QC/COMPLETED):
     received = sum POSTED OS-IN qty - sum POSTED supplier_returns
     received < sent: 0 -> SENT, >0 -> PARTIAL; received >= sent: pending IQC -> WAITING_QC else COMPLETED
     callers: OS-IN create/cancel (OR svc:427, :476), IqcService.confirmIqc, postSupplierReturn
  cancel (any status before CANCELLED, blocked by active OS-IN, E169) --> CANCELLED (final)
OS-IN (outsourcing-receipts.ts:17): create -> POSTED (svc:355) -> CANCELLED (svc:445). Progress of an OUTSOURCE operation is written only by `recomputeOutsourcedOperationProgress` (jobs.query:106): completedQuantity = received - returned; completedDate when >= planned; FG op done -> closeJobIfFinalAssemblyDone.

## 4. Key rules (error codes in `constants/error-code.constant.ts`)

- LSX: E081 not found (po.svc:232). E057 order deleted (:361, :454). E076 order not AWAITING_PRODUCTION (:364, :460). E084 qty edit only while PENDING (:367). E083 approve only from PENDING (:457). E078 orderItemId not in LSX (:376).
- JOB: E082 not found (jobs.svc:948). E087 wrong status (`ensureStatus` jobs.svc:979): PENDING for start/snapshot/BOM edits, IN_PROGRESS for due-date/plan. Unique (productionOrderId, itemId). Code `yy-LSXnum5-seq3` (jobs.svc:993).
- Job BOM edits (issues.query): E281 duplicate (:36, :60), E007 item missing (:44), E283 not DIRECT (:47), E282 issue not found (:168).
- Execution: E091 operation not found (exec svc:490). E260 OUTSOURCE ops not reportable by hand (:498). E087 JOB must be IN_PROGRESS (:502). E256 zero deltas or completed > planned (:509, :554). E210 FG assembly blocked until other ops done (:525). E279 403 operation not assigned (operations/operation-access.service.ts:78). completedDate set when completed >= planned (:587).
- OQC/NCR hooks: E175 job status (oqc.service:488). E213 no final op (oqc.service:492, ncrs.service:447). NCR LSX: E305 no order (ncrs.service:348), E307 qty 0 (:354), E306 duplicate (ncrId, ncrAction) (:366).
- FG receipt gates (`ensureProductionReceiptOqcCleared`, inventory-receipts.service.ts:1182): E196 QC incomplete (no QC row, open IQC, qty over passed OQC, or open row when no final OQC operation; :1219/:1232/:1235), E209 final OQC missing (:1223), E197 over job.quantity (:1239); details in quality.md. Outbound gate E205 outbound-orders.service.ts:739.
- OS-OUT: E019 supplier. E182 no items. E183 duplicate operation. E280 mixed operations in one order. Standalone orders: E166 operation is not an active OUTSOURCE one, E183 duplicate `itemCode`, E318 wrong route for the order's `origin`. E184 total sent over the BOM planned quantity (counts every non-cancelled order, locks the operations `FOR UPDATE`). E098 wrong status for the transition / already cancelled. E169 cancel blocked by active OS-IN (:407). E165 not found (:165). Outsourceable list: JOB IN_PROGRESS + OUTSOURCE ops only (:237-238).
- OS-IN: E185 no items (OR svc:524). E186 duplicate order item (:529). E187 supplier mismatch (:605). E171 source OS-OUT not yet sent (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED) or CANCELLED (:602). E172 over sent qty (:616). E170 not found (:189). E098 already cancelled (:453). E173 cancel blocked once IQC exists (:459). IQC generated when `requiresIqc` (:403).
- E167, E168 (outsourcing_order.*): no throw site in `src/api`.

## 5. Cross-domain links

- Orders: `OrdersService.approveOrder` (orders.service.ts:729-750) calls `getInitialPlanItems`/`seedPlan`; stock via `InventoryService.getStockLevels` (po.svc:569).
- Revision: JOB views (list, detail, BOM nodes), production-execution, OQC and outsourcing orders/receipts (`coalesce(production_job_bom_items.revision, items.revision)`) read `pj.item_revision` / `production_job_bom_items.revision`, not `items.revision`, so editing a product's revision after approval does not relabel its JOBs. SO, LSX lines, inventory and delivery still show the live revision. `item_revision` is nullable until a follow-up migration sets NOT NULL (old app compatibility).
- BOM/routing: `buildJobPlan` (snapshot.query:62) reads `boms`, `bom_items`, BOM operations, items; builds job BOM nodes (FG/COMPONENT/DIRECT), operations, issues.
- Inventory: `getProductionJobBom` joins `issuedQuantityByJobItemSubquery`, `balanceByItemSubquery`, `availableQuantityByItemSubquery` (jobs.svc:334-337); inventory-requisitions.service.ts:575 throws E087 on job status; FG receipt via `createProductionReceiptForJob`/`postInventoryReceipt`.
- Purchasing: `startJob` -> `PurchaseRequestsService.createShortageRequest` (jobs.svc:860).
- Quality: OQC (`createOqcForJob`, `confirmOqc`), IQC from OS-IN, `closeJobIfQcCovered`, NCR (`createProductionOrder`, `requestOqc` ncrs.service:421).
- Other: `FilesService.linkFiles`, `PdfRendererService`, `OperationAccessService` (`production-execution:read-all` lifts scope, operation-access.service.ts:38), `reports/reports.service.ts:118,280` reads JOB statuses.
