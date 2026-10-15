<!-- Generated: 2026-10-15 | Files scanned: 27 | Token estimate: ~3491 -->
# Production codemap

Paths relative to `src/api/` unless starting `database/` or `constants/`. `ctrl:N`/`svc:N` = line in that domain's controller/service (`po.svc`, `jobs.svc`, `exec svc`, `OO svc`, `OR svc` = the five services). Create/update routes return 204 unless noted.

## 1. Modules

| Folder | Files (lines) | Role |
|---|---|---|
| production-orders | ctrl 180, svc 772, export 49, dto/ | LSX header + plan lines, approve, logs, Excel/PDF. No query/write file: SQL inline in svc |
| production-jobs | ctrl 322, svc 988, `production-job-snapshot.query.ts` 542, `production-jobs.query.ts` 215, `production-job-issues.query.ts` 195, dto/ | JOB read/plan/start. snapshot.query builds BOM/ops/issues; jobs.query has close helpers; issues.query edits materials |
| production-execution | ctrl 136, svc 647, constant 30, dto/ | "Thuc hien san xuat" screens; only manual progress writer. No query file |
| outsourcing-orders | ctrl 118, svc 489, `outsourcing-orders.query.ts` 332, dto/ | OS-OUT (send out); query holds `recomputeOutsourcingOrderStatus` |
| outsourcing-receipts | ctrl 112, svc 702, `outsourcing-receipts.query.ts` 161, dto/ | OS-IN (receive back); query = received-qty subqueries |

No `*.write.ts` here; write helpers sit in `ncrs/ncrs.write.ts`, `iqc/iqc.write.ts`, `inventory-receipts/inventory-receipts.write.ts`. Schemas: `database/schemas/production/*` (13 files) and `database/schemas/inventory/outsourcing-{orders,order-items,receipts,receipt-items}.ts`.

## 2. Routes (44)

Tables: `po`=production_orders, `poi`=_order_items, `pol`=_order_logs, `pj`=production_jobs, `pjo`=_job_operations, `pjl`=_job_logs.

### production-orders (9) `/production-orders` perm prefix `production:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getProductionOrders ctrl:45 -> svc:93 | - |
| GET /export | read | exportProductionOrders ctrl:59 -> svc:156 (10,000-row cap) | - |
| GET /:productionOrdersId | read | getProductionOrdersById ctrl:71 -> svc:210 | - |
| GET /:id/export-pdf | read | exportProductionOrderPdf ctrl:85 -> svc:251 | - |
| PATCH /:id | update | updateProductionOrder ctrl:100 -> svc:333 (returns detail DTO) | poi, pol |
| PATCH /:id/note | update | updateProductionOrderNote ctrl:118 -> svc:726 | po.note, pol |
| PATCH /:id/signed-file | update | updateProductionOrderSignedFile ctrl:136 -> svc:687 (returns detail) | po.signedFileId, pol |
| GET /:id/logs | read | getProductionOrderLogs ctrl:155 -> svc:651 | - |
| POST /:id/approve | approve | approveProductionOrder ctrl:171 -> svc:428 (returns detail) | po, orders.status, pj + snapshot tables, pjl, pol |

### production-jobs (17) `/production-jobs` perm prefix `production:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getProductionJobs ctrl:60 -> svc:167 | - |
| GET /export-plan-pdf | read | exportProductionPlanPdf ctrl:73 -> svc:105 | - |
| GET /:jobId | read | getProductionJob ctrl:85 -> svc:244 (+oqc.query.ts:148) | - |
| GET /:jobId/bom | read | getProductionJobBom ctrl:98 -> svc:307 | - |
| GET /:jobId/operations | read | getProductionJobOperations ctrl:116 -> svc:410 (ctrl asserts operation access if `operationId`) | - |
| GET /:jobId/notes | read | getProductionJobNotes ctrl:139 -> svc:647 | - |
| GET /:jobId/logs | read | getProductionJobLogs ctrl:154 -> svc:673 | - |
| POST /:jobId/notes | update | createProductionJobNote ctrl:167 -> svc:469 | production_job_notes |
| POST /:jobId/bom | update | addIssues ctrl:186 -> svc:761 -> addJobIssues issues.query:26 | production_job_issues, job items/units, pjl (ITEMS_EDITED), pj.snapshotEditedAt |
| PATCH /:jobId/bom/:issueId | update | updateIssue ctrl:200 -> svc:772 -> updateJobIssue issues.query:112 | same as above |
| DELETE /:jobId/bom/:issueId | update | removeIssue ctrl:220 -> svc:784 -> removeJobIssue issues.query:136 | same as above |
| POST /:jobId/snapshot | update | reloadSnapshot ctrl:239 -> svc:747 | delete+insert job bom items/operations/issues, pj.snapshotLoadedAt |
| POST /:jobId/start | update | startJob ctrl:250 -> svc:808 | pj, pjl, purchase_requests (via `PurchaseRequestsService.createShortageRequest`) |
| GET /:jobId/operations/plan | read | getProductionJobPlanOperations ctrl:265 -> svc:514 | - |
| PATCH /:jobId/operations/plan | update | updateProductionJobOperationsPlan ctrl:278 -> svc:611 | pjo.dueDate |
| PATCH /:jobId/operations/:jobOperationId/due-date | update | updateProductionJobOperationDueDate ctrl:295 -> svc:487 | pjo.dueDate |
| POST /:jobId/qc | oqc:create | requestJobQc ctrl:315 -> `OqcService.createOqcForJob` oqc/oqc.service.ts:468 | quality_inspections (write body not read: unverified) |

### production-execution (6) `/production-execution` perm prefix `production-execution:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET /operations | read | getOperations ctrl:37 -> svc:83 | - |
| GET /jobs | read | getJobs ctrl:52 -> svc:192 | - |
| GET /jobs/:productionJobId | read | getJob ctrl:66 -> svc:342 | - |
| GET /jobs/:productionJobId/operations | read | getJobOperations ctrl:86 -> svc:367 | - |
| GET /jobs/:productionJobId/reports | read | getJobOperationReports ctrl:106 -> svc:403 | - |
| POST /operations/:jobOperationId/reports | report | createJobOperationReport ctrl:125 -> svc:478 | production_job_operation_reports(+_files), pjo, pj.status+pjl via `closeJobIfFinalAssemblyDone` |

### outsourcing-orders (6) `/outsourcing-orders` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingOrders ctrl:35 -> svc:62 | - |
| GET /outsourceable-operations | read | getOutsourceableOperations ctrl:49 -> svc:229 | - |
| GET /:outsourcingOrderId | read | getOutsourcingOrder ctrl:67 -> svc:120 | - |
| GET /:id/items | read | getOrderItems ctrl:82 -> svc:174 | - |
| POST / | create | createOutsourcingOrder ctrl:95 -> svc:354 | outsourcing_orders, outsourcing_order_items |
| POST /:id/cancel | update | cancelOutsourcingOrder ctrl:111 -> svc:387 | outsourcing_orders.status |

### outsourcing-receipts (6) `/outsourcing-receipts` perm prefix `outsourcing:`
| Route | Perm | Controller -> Service | Writes |
|---|---|---|---|
| GET / | read | getOutsourcingReceipts ctrl:33 -> svc:91 | - |
| GET /pending-order-items | read | getPendingOrderItems ctrl:47 -> svc:250 | - |
| GET /:outsourcingReceiptId | read | getOutsourcingReceipt ctrl:59 -> svc:180 | - |
| GET /:id/items | read | getReceiptItems ctrl:74 -> svc:203 | - |
| POST / | create | createOutsourcingReceipt ctrl:89 -> svc:350 | outsourcing_receipts(+items), quality_inspections (IQC, via `IqcService.createInspectionsFromOutsourcingReceipt`, only if `requiresIqc`), outsourcing_orders.status, pjo progress |
| POST /:id/cancel | update | cancelOutsourcingReceipt ctrl:105 -> svc:444 | outsourcing_receipts.status, outsourcing_orders.status, pjo progress |

## 3. State flows

LSX (`database/schemas/production/production-orders.ts:26`: PENDING, APPROVED, COMPLETED)

  orders.approveOrder (orders/orders.service.ts:732) -> getInitialPlanItems po.svc:542 + seedPlan po.svc:607
     PENDING --updateProductionOrder svc:333 (qty edit, PENDING only)
        | approveProductionOrder svc:428 (orders AWAITING_PRODUCTION -> IN_PROGRESS)
        +-- any line qty>0 --> APPROVED (+createJobs jobs.svc:703, 1 JOB per itemId)
        +-- all qty 0 (100% from stock) --> COMPLETED directly (log COMPLETED)
     APPROVED --all sibling JOBs COMPLETED--> COMPLETED
        (closeJobIfFullyReceived inventory-receipts.service.ts:794; no manual route)

  NCR secondary LSX: NcrsService.createProductionOrder ncrs/ncrs.service.ts:337 (NCR status APPROVED|IN_PROGRESS)
     insert directly APPROVED, sourceType=NCR, ncrId+ncrAction (REWORK|REMAKE), same orderId, 1 JOB, NCR -> IN_PROGRESS
     REWORK: qty=ncr.reworkQty, snapshot via `ReworkSnapshotOptions` (snapshot.query:108): only chosen ops + last FG op, issues []
     REMAKE: qty=ncr.remakeQty, normal snapshot
     LSX COMPLETED -> closeNcrIfProductionOrdersDone (ncrs/ncrs.write.ts:143, called inventory-receipts.service.ts:811):
     closes NCR (IN_PROGRESS -> closed) when COMPLETED LSX count >= (reworkQty>0)+(remakeQty>0)

JOB (`production-jobs.ts:30`: PENDING, IN_PROGRESS, WAITING_QC, WAITING_DELIVERY, COMPLETED; no manual route past start)

  createJobs jobs.svc:703 (+createJobSnapshot snapshot.query:136)
     PENDING --reloadSnapshot svc:747 / addIssues svc:761 / updateIssue / removeIssue (PENDING only)
        | startJob svc:808 (lock :814; shortage -> purchase request :849)
     IN_PROGRESS --report ops (exec svc:478) / OS-IN recompute (jobs.query:105)
        | closeJobIfFinalAssemblyDone jobs.query:26 (no FG op pending; callers exec svc:595, jobs.query:213)
     WAITING_QC --createOqcForJob oqc.service:468 allowed from IN_PROGRESS or WAITING_QC (E175)
        | closeJobIfQcCovered oqc/oqc.query.ts:279
        |   gate: coverage.total>0, open==0 (getJobQcCoverage :215), countPendingJobOperations==0 (jobs.query:78), final qty inspected (:342)
        |   then createProductionReceiptForJob (inventory-receipts.write.ts:81)
        |   callers: confirmOqc oqc.service:637, confirmIqc iqc.service:801, completeIqcAfterSupplierReturn iqc.write.ts:66
     WAITING_DELIVERY --postInventoryReceipt inventory-receipts.service.ts:644 (PRODUCTION receipt, :699)
        | closeJobIfFullyReceived :717: received + NCR-transferred (ncrs.query.ts:15) >= job.quantity
     COMPLETED (completedBy/At) -> if all sibling JOBs COMPLETED -> LSX COMPLETED (:794) -> closeNcrIfProductionOrdersDone (if ncrId)

Close chain: closeJobIfQcCovered -> closeJobIfFullyReceived -> LSX COMPLETED -> closeNcrIfProductionOrdersDone.

Outsourcing order (`database/schemas/inventory/outsourcing-orders.ts:25`: SENT, PARTIAL, WAITING_QC, COMPLETED, CANCELLED; status = state + receive progress)

  create svc:354 --> SENT
  `recomputeOutsourcingOrderStatus` (outsourcing-orders.query.ts:193, same tx; skips CANCELLED):
     received = sum POSTED OS-IN qty - sum POSTED supplier_returns
     received < sent: 0 -> SENT, >0 -> PARTIAL; received >= sent: pending IQC -> WAITING_QC else COMPLETED
     callers: OS-IN create/cancel (OR svc:425, :477), IqcService.confirmIqc, postSupplierReturn
  cancel svc:387 --> CANCELLED (final)
OS-IN (outsourcing-receipts.ts:17): create -> POSTED (svc:350) -> CANCELLED (svc:444). Progress of an OUTSOURCE operation is written only by `recomputeOutsourcedOperationProgress` (jobs.query:105): completedQuantity = received - returned; completedDate when >= planned; FG op done -> closeJobIfFinalAssemblyDone.

## 4. Key rules (error codes in `constants/error-code.constant.ts`)

- LSX: E081 not found (po.svc:233). E057 order deleted (:359, :448). E076 order not AWAITING_PRODUCTION (:362, :454). E084 qty edit only while PENDING (:365). E083 approve only from PENDING (:451). E078 orderItemId not in LSX (:374).
- JOB: E082 not found (jobs.svc:938). E087 wrong status (`ensureStatus` jobs.svc:970): PENDING for start/snapshot/BOM edits, IN_PROGRESS for due-date/plan. Unique (productionOrderId, itemId). Code `yy-LSXnum5-seq3` (jobs.svc:982).
- Job BOM edits (issues.query): E281 duplicate (:36, :60), E007 item missing (:44), E283 not DIRECT (:47), E282 issue not found (:168).
- Execution: E091 operation not found (exec svc:489). E260 OUTSOURCE ops not reportable by hand (:498). E087 JOB must be IN_PROGRESS (:502). E256 zero deltas or completed > planned (:509, :553). E210 FG assembly blocked until other ops done (:525). E279 403 operation not assigned (operations/operation-access.service.ts:78). completedDate set when completed >= planned (:587).
- OQC/NCR hooks: E175 job status (oqc.service:487). E213 no final op (oqc.service:491, ncrs.service:445). NCR LSX: E305 no order (ncrs.service:348), E307 qty 0 (:354), E306 duplicate (ncrId, ncrAction) (:366).
- FG receipt gates (inventory-receipts.service.ts ~:1178, throw sites unverified): E196 QC incomplete, E209 final OQC missing, E197 over job.quantity. Outbound gate E205 outbound-orders.service.ts:717.
- OS-OUT: E019 supplier (OO svc:455). E182 no items (:417). E183 duplicate operation (:422). E280 mixed operations in one order (:431). E098 already cancelled (:395). E169 cancel blocked by active OS-IN (:405). E165 not found (:166). Outsourceable list: JOB IN_PROGRESS + OUTSOURCE ops only (:235-236).
- OS-IN: E185 no items (OR svc:525). E186 duplicate order item (:530). E187 supplier mismatch (:610). E171 source OS-OUT CANCELLED (:607). E172 over sent qty (:622). E170 not found (:190). E098 already cancelled (:452). E173 cancel blocked once IQC exists (:458). IQC generated when `requiresIqc` (:400).
- E166, E167, E168, E184 (outsourcing_order.*): no throw site in `src/api`.

## 5. Cross-domain links

- Orders: `OrdersService.approveOrder` (orders.service.ts:732-750) calls `getInitialPlanItems`/`seedPlan`; stock via `InventoryService.getStockLevels` (po.svc:566).
- BOM/routing: `buildJobPlan` (snapshot.query:65) reads `boms`, `bom_items`, BOM operations, items; builds job BOM nodes (FG/COMPONENT/DIRECT), operations, issues.
- Inventory: `getProductionJobBom` joins `issuedQuantityByJobItemSubquery`, `balanceByItemSubquery`, `availableQuantityByItemSubquery` (jobs.svc:326-329); inventory-requisitions.service.ts:574 throws E087 on job status; FG receipt via `createProductionReceiptForJob`/`postInventoryReceipt`.
- Purchasing: `startJob` -> `PurchaseRequestsService.createShortageRequest` (jobs.svc:849).
- Quality: OQC (`createOqcForJob`, `confirmOqc`), IQC from OS-IN, `closeJobIfQcCovered`, NCR (`createProductionOrder`, `requestOqc` ncrs.service:421).
- Other: `FilesService.linkFiles`, `PdfRendererService`, `OperationAccessService` (`production-execution:read-all` lifts scope, operation-access.service.ts:38), `reports/reports.service.ts:118,280` reads JOB statuses.
