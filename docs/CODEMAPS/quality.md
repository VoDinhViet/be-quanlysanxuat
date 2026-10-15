<!-- Generated: 2026-10-15 | Files scanned: 40 | Token estimate: ~3600 -->
# Quality codemap

Includes the NCR<->OQC trace refs (PH-136). Controllers check permissions, services do not.

## 1. Modules

| Path | Lines | Role |
|---|---|---|
| src/api/iqc/iqc.service.ts | 1100 | IQC CRUD, confirm, auto-creation from receipts, stats, export |
| src/api/iqc/iqc.write.ts | 140 | Plain-tx fns: completeIqcAfterSupplierReturn:32, linkQcFiles:75, cancelReceiptInspections:99 |
| src/api/iqc/iqc.query.ts | 86 | Gates: hasPendingIqcForItems:23 (ignores COMPLETED and CANCELLED), areReceiptIqcInspectionsCompleted:61 |
| src/api/iqc/quality-inspection-status.util.ts | 28 | mapToQualityInspectionStatus:11 (legacy IqcStatus/OqcStatus -> DB status) |
| src/api/oqc/oqc.service.ts | 832 | OQC list/detail/export, createOqcForJob, confirmOqc, delete |
| src/api/oqc/oqc.query.ts | 357 | Quota/coverage/close-job helpers, generateOqcCode |
| src/api/ncrs/ncrs.service.ts | 547 | NCR approval flow, secondary LSX, re-OQC request, cost lines |
| src/api/ncrs/ncrs.write.ts | 178 | createNcrFromOqc:32, closeNcrAfterOqc:120, closeNcrIfProductionOrdersDone:143 (plain tx fns) |
| src/api/ncrs/ncrs.query.ts | 108 | getNcrTransferredQtyByJobId:15, getNcrRefById:36, getNcrRefsByQualityInspectionId:51, getNcrTrace:63 |
| src/database/schemas/quality/ | 8 files | quality-enums, quality-inspections:43, quality-inspection-results:31, quality-inspection-evidences:28, ncrs:78, ncr-logs:39, ncr-cost-lines:34, quality-inspections-relations |

Modules: IqcModule imports SupplierReturnsModule (iqc.module.ts); OqcModule imports only FilesModule; NcrsModule imports ProductionJobsModule. Reverse calls (OQC -> NCR, IQC/inventory -> OQC) use plain functions taking `tx`, to avoid module cycles.

Tables: `quality_inspections` (case row; IQC and OQC share it via `inspectionType`, mirrors the latest attempt), `quality_inspection_results` (append-only attempts, unique (inspection, attemptNo)), `quality_inspection_evidences` (QC_EVIDENCE / DISPOSITION_EVIDENCE per attempt), `ncrs`, `ncr_logs` (append-only), `ncr_cost_lines`.

## 2. Routes (all under /api)

IQC (iqc.controller.ts, 8 routes)

| Route | Permission | Handler -> Service | Writes |
|---|---|---|---|
| GET /iqc :36 | iqc:read | getIqcs -> getIqcs:109 | - |
| GET /iqc/stats :50 | iqc:read | getIqcStats -> getIqcStats:282 | - |
| GET /iqc/export :62 | iqc:read | exportIqc -> exportIqc:219 (cap 10000 rows) | - |
| GET /iqc/:iqcId :73 | iqc:read | getIqc -> getIqc:506 | - |
| POST /iqc :83 | iqc:create | createIqc -> createIqc:322 | quality_inspections, quality_inspection_results (if `result`), document_sequences, inventory_receipts (syncReceiptIqcStatus) |
| POST /iqc/:iqcId/confirm :96 | iqc:update | confirmIqc -> confirmIqc:673 | results, inspections, evidences, files, supplier_returns, production_jobs(+logs), outsourcing_orders, inventory_receipts |
| PATCH /iqc/:iqcId :112 | iqc:update | updateIqc -> updateIqc:993 (only `requestedAt`) | quality_inspections |
| DELETE /iqc/:iqcId :126 | iqc:delete | deleteIqc -> deleteIqc:966 | quality_inspections, inventory_receipts |

OQC (oqc.controller.ts, 5 routes)

| Route | Permission | Handler -> Service | Writes |
|---|---|---|---|
| GET /oqc :32 | oqc:read | getOqcs -> getOqcs:84 | - |
| GET /oqc/export :46 | oqc:read | exportOqc -> exportOqc:216 | - |
| GET /oqc/:oqcId :57 | oqc:read | getOqc -> getOqc:332 (adds `ncr`, `spawnedNcrs`, latest-attempt files) | - |
| POST /oqc/:oqcId/confirm :67 | oqc:update | confirmOqc -> confirmOqc:539 | results, inspections, evidences, files, inventory_receipts(+items), production_jobs(+logs), ncrs(+logs) |
| DELETE /oqc/:oqcId :82 | oqc:delete | deleteOqc -> deleteOqc:751 | quality_inspections |

OQC rows are created elsewhere: POST /production-jobs/:jobId/qc (production-jobs.controller.ts:307, oqc:create) -> OqcService.createOqcForJob:464, and NCR requestOqc below.

NCR (ncrs.controller.ts, 13 routes)

| Route | Permission | Handler -> Service | Writes |
|---|---|---|---|
| GET /ncrs :36 | ncr:read | getNcrs -> getNcrs:73 | - |
| POST /ncrs :45 | ncr:create | createNcr -> createNcr:145 (manual) | ncrs, ncr_logs, document_sequences |
| GET /ncrs/:ncrId :58 | ncr:read | getNcr -> getNcr:101 (+getNcrTrace) | - |
| GET /ncrs/:ncrId/operations :63 | ncr:read | getNcrOperations -> getNcrOperations:128 (buildJobPlan, read-only) | - |
| PATCH /ncrs/:ncrId :77 | ncr:update | updateNcr -> updateNcr:178 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/submit :91 | ncr:update | submitNcr -> submitNcr:217 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/approve :104 | ncr:approve | approveNcr -> approveNcr:252 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/reject :114 | ncr:approve | rejectNcr -> rejectNcr:270 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/close :128 | ncr:update | closeNcr -> closeNcr:295 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/production-order :141 | ncr:update | createProductionOrder -> createProductionOrder:337 | production_orders(+logs), production jobs via ProductionJobsService.createJobs, ncrs, ncr_logs |
| POST /ncrs/:ncrId/skip-production-order :159 | ncr:update | completeWithoutProductionOrder -> :313 | ncrs, ncr_logs |
| POST /ncrs/:ncrId/oqc :175 | ncr:update + oqc:create | requestOqc -> requestOqc:421 | quality_inspections, ncrs, ncr_logs |
| PUT /ncrs/:ncrId/cost-lines :189 | ncr:update | saveCostLines -> saveCostLines:478 (delete + insert, no status guard) | ncr_cost_lines |

Create/update/action routes return 204.

## 3. State flows

IQC (status DB enum: DRAFT, PENDING, IN_PROGRESS, COMPLETED, CANCELLED; computed by resolveIqcStatus:651 then mapped)

    auto-create DRAFT  <- createInspectionsFromReceipt:404 (receipt confirm), createInspectionsFromOutsourcingReceipt:458 (OS-IN requiresIqc)
    manual create      <- createIqc:322 (DRAFT, or status from `result`/`disposition`, attemptCount 0/1)
    confirmIqc:673 (re-callable, each call = new attempt, overwrites decision):
      PASS                    -> COMPLETED
      FAIL, no disposition    -> PENDING
      FAIL + CONCESSION       -> COMPLETED
      FAIL + SORT|RETURN      -> IN_PROGRESS (= waiting supplier return; `IqcStatus.WAITING_RETURN` in service code, mapped to DB `IN_PROGRESS` by `mapToQualityInspectionStatus`) + supplier_returns DRAFT
                                 (createFromIqcDisposition; qty = whole lot for RETURN, sortNgQty for SORT)
    IN_PROGRESS -> COMPLETED : completeIqcAfterSupplierReturn (iqc.write.ts:32), called from
                               SupplierReturnsService.postSupplierReturn (supplier-returns.service.ts:399)
    any status -> CANCELLED : cancelReceiptInspections (iqc.write.ts:99) on inventory receipt cancel; no status filter, also cancels DRAFT supplier_returns, E290 if a POSTED return exists
    DRAFT -> deleted         : deleteIqc:966

Every COMPLETED transition calls syncReceiptIqcStatus (PENDING_IQC <-> IQC_COMPLETED on the inventory receipt, inventory-receipts.write.ts:146) and, when the row has `productionJobId` (OS-IN lines), closeJobIfQcCovered. OS-IN lines also call recomputeOutsourcingOrderStatus (iqc.service.ts:879).

OQC (status uses the same DB enum; resolveOqcStatus:797)

    createOqcForJob:464 / NCR requestOqc:421 -> DRAFT (decision/disposition null)
    confirmOqc:539 (re-callable until COMPLETED; E177 enforced by row lock getOqcInspectionForUpdate:662):
      PASS                    -> COMPLETED
      FAIL, no disposition    -> PENDING
      FAIL + ACCEPT|SORT|SCRAP -> COMPLETED
      FAIL + REWORK           -> IN_PROGRESS (legacy; no guard rejects it in confirmOqc)
    Attempt = 1 row quality_inspection_results + mirror on quality_inspections (+ attemptCount) + evidence rows.
    startedAt/inspectedBy set on first confirm; approvedAt/approvedBy set on first disposition, cleared if a later attempt has none (buildConfirmAudit:696).
    SORT needs sortOkQty+sortNgQty summing to lot qty (validateSortSplit:774).

PH-136 flow (OQC FAIL -> NCR -> re-OQC)

    confirmOqc FAIL+SORT (ngQty split)
      -> inside tx: createNcrFromOqc (ncrs.write.ts:32) if sortNgQty > 0
         NCR-NB = type INTERNAL, originType OQC, status OPEN, ngQty = sortNgQty, qualityInspectionId = OQC,
         orderId from the job's LSX, parentNcrId = the OQC's own ncrId (re-OQC loop). NCR-KH = CUSTOMER, manual only (createNcr:145).
    OPEN --updateNcr--> OPEN|REJECTED (edit analysis, reworkQty/remakeQty; ngQty editable only if MANUAL)
    OPEN|REJECTED --submitNcr--> PENDING_APPROVAL --approveNcr--> APPROVED
                                                 --rejectNcr--> REJECTED (reason required, then edit + resubmit)
    APPROVED (qty to process = reworkQty+remakeQty > 0), choose:
      (a) createProductionOrder (REWORK or REMAKE, one LSX each) -> status IN_PROGRESS; LSX sourceType NCR, APPROVED
          LSX COMPLETED -> closeJobIfFullyReceived (inventory-receipts.service.ts:715) -> closeNcrIfProductionOrdersDone
          (ncrs.write.ts:143, called at :809) -> CLOSED when every required action has a COMPLETED LSX
      (b) completeWithoutProductionOrder -> PENDING_QC ("no LSX")
      (c) closeNcr (only when processing qty = 0) -> CLOSED
    requestOqc (from APPROVED or PENDING_QC): new OQC DRAFT with ncrId, NCR -> PENDING_QC
    re-OQC confirmOqc COMPLETED -> closeNcrAfterOqc (ncrs.write.ts:120): NCR PENDING_QC -> CLOSED;
      if that re-OQC is SORT with NG left, createNcrFromOqc links a child NCR via parentNcrId.
    Trace: getNcr returns qualityInspection (source OQC), parentNcr, childNcrs, reinspections (ncrs.query.ts:63);
    getOqc returns `ncr` (OQC.ncrId) and `spawnedNcrs` (ncrs.qualityInspectionId = OQC).

OQC COMPLETED downstream (inside confirmOqc tx, only if the row has `productionJobId`)

    createProductionReceiptForJob (inventory-receipts.write.ts:82): PRODUCTION receipt at PENDING_RECEIPT for
      (target - existing); target = getPassedOqcQuantityByJobId (oqc.query.ts:165) = sum(coalesce(sortOkQty, quantity))
      over COMPLETED, non-SCRAP lots (ACCEPT counts full qty; SORT counts only sortOkQty)
    closeJobIfQcCovered (oqc.query.ts:269): job IN_PROGRESS|WAITING_QC -> WAITING_DELIVERY (+production_job_logs)
      only if coverage.total>0, no open QC row, no pending operations, and final-op qty fully requested;
      then tops up the missing receipt. Job -> COMPLETED later via closeJobIfFullyReceived (counts NG moved to NCR).

## 4. Key rules and error codes (src/constants/error-code.constant.ts)

- IQC: E138 not found; E139 disposition without FAIL (createIqc:333); E159 IN_PROGRESS locked (:740, :957); E288 CANCELLED (:737); E254 SORT/RETURN needs supplierId (:693); E160/E161/E162 sort split mismatch/not allowed/required (validateDecision:893); E144 update before confirm (:1021); E206 delete only DRAFT (:979); E164 supplier-return completion needs IN_PROGRESS (iqc.write.ts:55); E290 cancel blocked by POSTED supplier return (iqc.write.ts:114); E019/E007/E096/E121 missing supplier/item/receipt/PO.
- OQC: E174 not found; E082 job not found; E175 job must be IN_PROGRESS|WAITING_QC (:482); E213 no valid FG/non-OUTSOURCE operation (:486, also ncrs.service.ts:446); E199 no itemId (:490); E198 qty <= 0 or > completed minus inspected (:507); E176 sum over BOM node > plannedQuantity (:513); E177 already COMPLETED (:687, :827); E178 delete only DRAFT (:764); E160/E161/E162 as IQC (:774; E161 only on FAIL).
- SCRAP rows are excluded from quota (notScrapped, oqc.query.ts:30), from passed qty and from coverage `total`; they stay in `open` only while not COMPLETED.
- Re-OQC rows (`ncrId` set) are excluded from quota (notNcrReinspection, oqc.query.ts:38; E198/E176/isFinalQuantityInspected) because the original SORT lot already holds their qty, but they still count in passed qty. `getNcrTransferredQtyByJobId` = Σ OQC-origin NCR `ngQty` minus Σ qty of COMPLETED non-SCRAP re-OQC lots of those NCRs, so a re-inspected unit is not counted both as received and as transferred.
- NCR: E300 not found; E301 invalid status (ensureStatus:530; also closeNcr when processing qty > 0, :299); E302 department required (create CUSTOMER :151, submit :222); E303 rework+remake > ngQty (:194); E304 client required for CUSTOMER (:148); E305 no orderId for LSX (:348); E306 LSX already exists for that action (:366); E307 no processing qty (:354, :513); E308 re-OQC qty <= 0 or > processing qty minus qty already requested for that NCR (`getNcrRequestedReinspectionQty`, all statuses incl. SCRAP) (:437); E309 rootCause/correctiveAction required (:225); E310 reworkOperationIds required when reworkQty > 0 (:228); E311 NCR has no job for re-OQC (:431).
- Downstream gates reading QC: `ensureProductionReceiptOqcCleared` (production receipt confirm, inventory-receipts.service.ts:1183) calls `getJobQcCoverage` and throws E196 when `total = 0` or `openIqc > 0` (an IQC row, e.g. OS-IN, still open; :1220), when confirmed PRODUCTION qty plus this receipt exceeds the passed OQC qty (:1233), or, for a JOB with no final OQC operation, when any QC row is open (:1236); E209 when the final-assembly node has no COMPLETED QC row (:1224); E197 when qty exceeds `job.quantity` (:1240). E205 (outbound order send, outbound-orders.service.ts:739) uses the same coverage: `total = 0`, `openIqc > 0`, no completed final lot, or (no final operation) any open row; E203 (inventory issue, hasPendingIqcForItems; CANCELLED IQC ignored), E153 (receipt post needs all IQC COMPLETED).
- DB checks: `decision` only PASS|FAIL (chk_quality_inspections_decision_in_use); disposition only with FAIL; sort qty pair sums to quantity; OQC requires job + operation and no supplier/client; `ncrs.rework+remake <= ng`; CUSTOMER NCR needs client.
- Codes: IQC-YYYY-NNNNN (iqc.service.ts:1035), OQC-... (oqc.query.ts:349), NCR-... (ncrs.write.ts:84).

## 5. Cross-domain links

- production-jobs: POST /production-jobs/:jobId/qc creates OQC; getJob reads getOqcRequestableQuantity (production-jobs.service.ts:285) and now returns ncrId/ncrCode of the job's LSX (production-orders also expose ncrId/ncrCode); `production_orders.ncrId/ncrAction` (REWORK|REMAKE) link LSX phụ to NCR; NCR secondary LSX jobs are built by ProductionJobsService.createJobs (REWORK: no material, only chosen operations).
- inventory-receipts: IQC auto-created in confirm (inventory-receipts.service.ts:607) and cancelled in cancel (:877); production receipts from OQC pass; NCR NG qty counts as handled in closeJobIfFullyReceived (:740).
- supplier-returns: IQC SORT/RETURN creates DRAFT return (supplier-returns.service.ts:286); posting it completes the IQC (:399).
- outsourcing: OS-IN receipt lines with requiresIqc create IQC anchored to the OUTSOURCE operation (outsourcing-receipts.service.ts:398); IQC confirm recomputes the OS-OUT status. OQC never covers OUTSOURCE operations.
- Unverified: whether a secondary (REWORK/REMAKE) job's output goes through OQC before receipt; whether `requestOqc` limits the cumulative qty across repeated requests (only per-request qty is checked, ncrs.service.ts:436); createIqc with FAIL+SORT/RETURN sets IN_PROGRESS but does not create the supplier return or run the E254/sort-split checks (only confirmIqc does), so such a row cannot be confirmed again (E159).
