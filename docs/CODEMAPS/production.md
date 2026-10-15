<!-- Generated: 2026-10-15 | Files scanned: 27 | Token estimate: ~3530 -->
# Production codemap

Paths relative to `src/api/` unless starting `database/` or `constants/`. `ctrl:N`/`svc:N` = line in that domain's controller/service (`po.svc`, `jobs.svc`, `exec svc`, `OO svc`, `OR svc` = the five services). Create/update routes return 204 unless noted.

## 1. Modules

| Folder | Files (lines) | Role |
|---|---|---|
| production-orders | ctrl 180, svc 774, export 49, dto/ | LSX header + plan lines, approve, logs, Excel/PDF. No query/write file: SQL inline in svc |
| production-jobs | ctrl 322, svc 987, `production-job-snapshot.query.ts` 539, `production-jobs.query.ts` 216, `production-job-issues.query.ts` 195, dto/ | JOB read/plan/start. snapshot.query builds BOM/ops/issues; jobs.query has close helpers; issues.query edits materials |
| production-execution | ctrl 136, svc 642, constant 30, dto/ | "Thuc hien san xuat" screens; only manual progress writer. No query file |
| outsourcing-orders | ctrl 118, svc 486, `outsourcing-orders.query.ts` 327, dto/ | OS-OUT (send out); query holds `recomputeOutsourcingOrderStatus` |
| outsourcing-receipts | ctrl 112, svc 689, `outsourcing-receipts.query.ts` 155, dto/ | OS-IN (receive back); query = received-qty subqueries |

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

### production-jobs (17) `/production-jobs` perm prefix `production:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getProductionJobs ctrl:60 -> svc:166 | - |
| GET /export-plan-pdf | read | exportProductionPlanPdf ctrl:73 -> svc:105 | - |
| GET /:jobId | read | getProductionJob ctrl:85 -> svc:243 (+oqc.query.ts:145) | - |
| GET /:jobId/bom | read | getProductionJobBom ctrl:98 -> svc:308 | - |
| GET /:jobId/operations | read | getProductionJobOperations ctrl:116 -> svc:408 (ctrl asserts operation access if `operationId`) | - |
| GET /:jobId/notes | read | getProductionJobNotes ctrl:139 -> svc:643 | - |
| GET /:jobId/logs | read | getProductionJobLogs ctrl:154 -> svc:669 | - |
| POST /:jobId/notes | update | createProductionJobNote ctrl:167 -> svc:467 | production_job_notes |
| POST /:jobId/bom | update | addIssues ctrl:186 -> svc:759 -> addJobIssues issues.query:26 | production_job_issues, job items/units, pjl (ITEMS_EDITED), pj.snapshotEditedAt |
| PATCH /:jobId/bom/:issueId | update | updateIssue ctrl:200 -> svc:770 -> updateJobIssue issues.query:112 | same as above |
| DELETE /:jobId/bom/:issueId | update | removeIssue ctrl:220 -> svc:782 -> removeJobIssue issues.query:136 | same as above |
| POST /:jobId/snapshot | update | reloadSnapshot ctrl:239 -> svc:743 | delete+insert job bom items/operations/issues, pj.snapshotLoadedAt |
| POST /:jobId/start | update | startJob ctrl:250 -> svc:807 | pj, pjl, purchase_requests (via `PurchaseRequestsService.createShortageRequest`) |
| GET /:jobId/operations/plan | read | getProductionJobPlanOperations ctrl:265 -> svc:511 | - |
| PATCH /:jobId/operations/plan | update | updateProductionJobOperationsPlan ctrl:278 -> svc:608 | pjo.dueDate |
| PATCH /:jobId/operations/:jobOperationId/due-date | update | updateProductionJobOperationDueDate ctrl:295 -> svc:486 | pjo.dueDate |
| POST /:jobId/qc | oqc:create | requestJobQc ctrl:315 -> `OqcService.createOqcForJob` oqc/oqc.service.ts:464 | quality_inspections (write body not read: unverified) |

### production-execution (6) `/production-execution` perm prefix `production-execution:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET /operations | read | getOperations ctrl:37 -> svc:84 | - |
| GET /jobs | read | getJobs ctrl:52 -> svc:194 | - |
| GET /jobs/:productionJobId | read | getJob ctrl:66 -> svc:344 | - |
| GET /jobs/:productionJobId/operations | read | getJobOperations ctrl:86 -> svc:368 | - |
| GET /jobs/:productionJobId/reports | read | getJobOperationReports ctrl:106 -> svc:402 | - |
| POST /operations/:jobOperationId/reports | report | createJobOperationReport ctrl:125 -> svc:476 | production_job_operation_reports(+_files), pjo, pj.status+pjl via `closeJobIfFinalAssemblyDone` |

### outsourcing-orders (6) `/outsourcing-orders` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingOrders ctrl:35 -> svc:62 | - |
| GET /outsourceable-operations | read | getOutsourceableOperations ctrl:49 -> svc:228 | - |
| GET /:outsourcingOrderId | read | getOutsourcingOrder ctrl:67 -> svc:120 | - |
| GET /:id/items | read | getOrderItems ctrl:82 -> svc:173 | - |
| POST / | create | createOutsourcingOrder ctrl:95 -> svc:355 | outsourcing_orders, outsourcing_order_items |
| POST /:id/cancel | update | cancelOutsourcingOrder ctrl:111 -> svc:388 | outsourcing_orders.status |

### outsourcing-receipts (6) `/outsourcing-receipts` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingReceipts ctrl:33 -> svc:90 | - |
| GET /pending-order-items | read | getPendingOrderItems ctrl:47 -> svc:247 | - |
| GET /:outsourcingReceiptId | read | getOutsourcingReceipt ctrl:59 -> svc:179 | - |
| GET /:id/items | read | getReceiptItems ctrl:74 -> svc:200 | - |
| POST / | create | createOutsourcingReceipt ctrl:89 -> svc:349 | outsourcing_receipts(+items), quality_inspections (IQC, via `IqcService.createInspectionsFromOutsourcingReceipt`, only if `requiresIqc`), outsourcing_orders.status, pjo progress |
| POST /:id/cancel | update | cancelOutsourcingReceipt ctrl:105 -> svc:439 | outsourcing_receipts.status, outsourcing_orders.status, pjo progress |

## 3. State flows

LSX (`database/schemas/production/production-orders.ts:27`: PENDING, APPROVED, COMPLETED)

  orders.approveOrder (orders/orders.service.ts:732) -> getInitialPlanItems po.svc:547 + seedPlan po.svc:610
     PENDING --updateProductionOrder svc:335 (qty edit, PENDING only)
        | approveProductionOrder svc:434 (orders AWAITING_PRODUCTION -> IN_PROGRESS)
        +-- any line qty>0 --> APPROVED (+createJobs jobs.svc:700, 1 JOB per itemId)
        +-- all qty 0 (100% from stock) --> COMPLETED directly (log COMPLETED)
     APPROVED --all sibling JOBs COMPLETED--> COMPLETED
        (closeJobIfFullyReceived inventory-receipts.service.ts:792; no manual route)

  NCR secondary LSX: NcrsService.createProductionOrder ncrs/ncrs.service.ts:337 (NCR status APPROVED|IN_PROGRESS)
     insert directly APPROVED, sourceType=NCR, ncrId+ncrAction (REWORK|REMAKE), same orderId, 1 JOB, NCR -> IN_PROGRESS
     REWORK: qty=ncr.reworkQty, snapshot via `ReworkSnapshotOptions` (snapshot.query:106): only chosen ops + last FG op, issues []
     REMAKE: qty=ncr.remakeQty, normal snapshot
     LSX COMPLETED -> closeNcrIfProductionOrdersDone (ncrs/ncrs.write.ts:143, called inventory-receipts.service.ts:809):
     closes NCR (IN_PROGRESS -> closed) when COMPLETED LSX count >= (reworkQty>0)+(remakeQty>0)

JOB (`production-jobs.ts:26`: PENDING, IN_PROGRESS, WAITING_QC, WAITING_DELIVERY, COMPLETED; no manual route past start)

  createJobs jobs.svc:700 (+createJobSnapshot snapshot.query:134)
     PENDING --reloadSnapshot svc:743 / addIssues svc:759 / updateIssue / removeIssue (PENDING only)
        | startJob svc:807 (lock :813; shortage -> purchase request :848)
     IN_PROGRESS --report ops (exec svc:476) / OS-IN recompute (jobs.query:106)
        | closeJobIfFinalAssemblyDone jobs.query:27 (no FG op pending; callers exec svc:592, jobs.query:214)
     WAITING_QC --createOqcForJob oqc.service:464 allowed from IN_PROGRESS or WAITING_QC (E175)
        | closeJobIfQcCovered oqc/oqc.query.ts:269
        |   gate: coverage.total>0, open==0 (getJobQcCoverage :205), countPendingJobOperations==0 (jobs.query:80), final qty inspected (:332)
        |   then createProductionReceiptForJob (inventory-receipts.write.ts:82)
        |   callers: confirmOqc oqc.service:630, confirmIqc iqc.service:798, completeIqcAfterSupplierReturn iqc.write.ts:68
     WAITING_DELIVERY --postInventoryReceipt inventory-receipts.service.ts:643 (PRODUCTION receipt, :698)
        | closeJobIfFullyReceived :715: received + NCR-transferred (ncrs.query.ts:15) >= job.quantity
     COMPLETED (completedBy/At) -> if all sibling JOBs COMPLETED -> LSX COMPLETED (:792) -> closeNcrIfProductionOrdersDone (if ncrId)

Close chain: closeJobIfQcCovered -> closeJobIfFullyReceived -> LSX COMPLETED -> closeNcrIfProductionOrdersDone.

Outsourcing order (`database/schemas/inventory/outsourcing-orders.ts:23`: SENT, PARTIAL, WAITING_QC, COMPLETED, CANCELLED; status = state + receive progress)

  create svc:355 --> SENT
  `recomputeOutsourcingOrderStatus` (outsourcing-orders.query.ts:190, same tx; skips CANCELLED):
     received = sum POSTED OS-IN qty - sum POSTED supplier_returns
     received < sent: 0 -> SENT, >0 -> PARTIAL; received >= sent: pending IQC -> WAITING_QC else COMPLETED
     callers: OS-IN create/cancel (OR svc:421, :470), IqcService.confirmIqc, postSupplierReturn
  cancel svc:388 --> CANCELLED (final)
OS-IN (outsourcing-receipts.ts:17): create -> POSTED (svc:349) -> CANCELLED (svc:439). Progress of an OUTSOURCE operation is written only by `recomputeOutsourcedOperationProgress` (jobs.query:106): completedQuantity = received - returned; completedDate when >= planned; FG op done -> closeJobIfFinalAssemblyDone.

## 4. Key rules (error codes in `constants/error-code.constant.ts`)

- LSX: E081 not found (po.svc:232). E057 order deleted (:361, :454). E076 order not AWAITING_PRODUCTION (:364, :460). E084 qty edit only while PENDING (:367). E083 approve only from PENDING (:457). E078 orderItemId not in LSX (:376).
- JOB: E082 not found (jobs.svc:936). E087 wrong status (`ensureStatus` jobs.svc:967): PENDING for start/snapshot/BOM edits, IN_PROGRESS for due-date/plan. Unique (productionOrderId, itemId). Code `yy-LSXnum5-seq3` (jobs.svc:981).
- Job BOM edits (issues.query): E281 duplicate (:36, :60), E007 item missing (:44), E283 not DIRECT (:47), E282 issue not found (:168).
- Execution: E091 operation not found (exec svc:487). E260 OUTSOURCE ops not reportable by hand (:495). E087 JOB must be IN_PROGRESS (:499). E256 zero deltas or completed > planned (:506, :550). E210 FG assembly blocked until other ops done (:522). E279 403 operation not assigned (operations/operation-access.service.ts:78). completedDate set when completed >= planned (:584).
- OQC/NCR hooks: E175 job status (oqc.service:482). E213 no final op (oqc.service:486, ncrs.service:445). NCR LSX: E305 no order (ncrs.service:348), E307 qty 0 (:354), E306 duplicate (ncrId, ncrAction) (:366).
- FG receipt gates (`ensureProductionReceiptOqcCleared`, inventory-receipts.service.ts:1183): E196 QC incomplete (no QC row, open IQC, qty over passed OQC, or open row when no final OQC operation; :1220/:1233/:1236), E209 final OQC missing (:1224), E197 over job.quantity (:1240); details in quality.md. Outbound gate E205 outbound-orders.service.ts:717.
- OS-OUT: E019 supplier (OO svc:454). E182 no items (:416). E183 duplicate operation (:421). E280 mixed operations in one order (:430). E098 already cancelled (:396). E169 cancel blocked by active OS-IN (:404). E165 not found (:165). Outsourceable list: JOB IN_PROGRESS + OUTSOURCE ops only (:234-235).
- OS-IN: E185 no items (OR svc:518). E186 duplicate order item (:523). E187 supplier mismatch (:599). E171 source OS-OUT CANCELLED (:596). E172 over sent qty (:610). E170 not found (:189). E098 already cancelled (:447). E173 cancel blocked once IQC exists (:453). IQC generated when `requiresIqc` (:397).
- E166, E167, E168, E184 (outsourcing_order.*): no throw site in `src/api`.

## 5. Cross-domain links

- Orders: `OrdersService.approveOrder` (orders.service.ts:732-750) calls `getInitialPlanItems`/`seedPlan`; stock via `InventoryService.getStockLevels` (po.svc:569).
- BOM/routing: `buildJobPlan` (snapshot.query:63) reads `boms`, `bom_items`, BOM operations, items; builds job BOM nodes (FG/COMPONENT/DIRECT), operations, issues.
- Inventory: `getProductionJobBom` joins `issuedQuantityByJobItemSubquery`, `balanceByItemSubquery`, `availableQuantityByItemSubquery` (jobs.svc:327-330); inventory-requisitions.service.ts:575 throws E087 on job status; FG receipt via `createProductionReceiptForJob`/`postInventoryReceipt`.
- Purchasing: `startJob` -> `PurchaseRequestsService.createShortageRequest` (jobs.svc:848).
- Quality: OQC (`createOqcForJob`, `confirmOqc`), IQC from OS-IN, `closeJobIfQcCovered`, NCR (`createProductionOrder`, `requestOqc` ncrs.service:421).
- Other: `FilesService.linkFiles`, `PdfRendererService`, `OperationAccessService` (`production-execution:read-all` lifts scope, operation-access.service.ts:38), `reports/reports.service.ts:118,280` reads JOB statuses.
