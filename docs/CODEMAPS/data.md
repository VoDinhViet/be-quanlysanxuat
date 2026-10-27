<!-- Generated: 2026-10-27 | Files scanned: 40 | Token estimate: ~2590 -->
# Data Codemap

**Last Updated:** 2026-10-16
**Entry Points:** `src/database/schemas/index.ts` (re-exports everything), `src/database/database.module.ts` (`DRIZZLE` token), `drizzle.config.ts`
**Engine:** Postgres via postgres.js + drizzle-orm. Companion: `docs/CODEMAPS/architecture.md`.

## Conventions
- Soft delete (`deleted_at`) exists only on: `items`, `clients`, `operations`, `users`, `roles`, `suppliers`, `orders`. Every other table hard-deletes or is status-driven. Filter `deletedAt` in queries on those.
- Quantities are `numeric(18,3, { mode: 'number' })` (e.g. `ncrs.ng_qty`, `purchase_order_items`); drizzle returns JS numbers.
- Audit FKs (`created_by`, `approved_by`, `posted_by`, `sent_by`, ... ) point to `users.id`, not `credentials.id`. `credentials.user_id` (unique, restrict) links a login identity to a user and holds `role_id`; the JWT `sub` is the credential id.
- Dates: `date` columns use `{ mode: 'date' }` and are compared as UTC midnight. "Today" for business rules is Vietnam time: `vnToday()` in `src/database/vn-date.util.ts` returns UTC-midnight of the `Asia/Ho_Chi_Minh` calendar day (plain `new Date()` is off by a day 00:00-06:59 VN). `VN_TODAY` constant lives in `reports.service.ts`. Timestamps are plain `timestamp` (no tz).
- Each business enum is a TypeScript `enum` exported from the schema file and mirrored as `pgEnum`; changing a value needs a migration and rewrite of partial indexes that name it. FK `onDelete` counts across schemas: restrict 70, set null 125, cascade 49.
- Codes (`code`/`inspection_no`) are unique varchars generated via `document_sequences` (see architecture.md).
- Cycle-breaking: `quality-inspections-relations.ts` is a separate file; polymorphic origin (`origin_type` + `origin_id`) has no drizzle relation, services join by hand.
- Schema column comments are largely Vietnamese.

## Tables by folder (`src/database/schemas/`)
- Top level: `files` (uploaded file registry; `FileKind` IMAGE/DOCUMENT/EVIDENCE, `UploadType` per screen), `document_sequences`, `departments`, `positions`, `countries`, `operations` (+ `operation_assignments`).
- `identity-access/`: `users` (profile; `user_status`, gender), `credentials` (login, role link), `roles` (permission code sets).
- `clients/`: `clients`, `client_groups`, `client_contacts`.
- `suppliers/`: `suppliers`, `supplier_groups`, `supplier_files`, `supplier_representatives`, `supplier_payment_info`.
- `units/`: `units` (`unit_type`, `unit_status`); item-specific conversion in `items/item_units`.
- `items/`: `items` (types FG/DIRECT, code + revision; nullable `item_category_id` -> `item_categories`, restrict), `item_categories` (code unique; seeded by migration 0240), `item_files`, `item_units`, `boms`, `bom_items` (`bom_node_type`: COMPONENT/DIRECT), `bom_operations`, `routing_operations`.
- `orders/`: `orders` (sales order SO, FK `client_id`, `assigned_user_id`), `order_items` (FK `order_id`, `item_id`), `order_files`.
- `production/`: `production_orders` (LSX; FK `order_id`, optional `ncr_id`), `production_order_items` (FK `production_order_id`, `order_item_id`, `item_id`), `production_order_logs`, `production_jobs` (JOB; FK `production_order_id`, `item_id`), `production_job_items`, `production_job_units`, `production_job_bom_items` (snapshot of BOM), `production_job_operations` (FK `production_job_id`, `operation_id`, bom item), `production_job_operation_reports` (+ `_report_files`), `production_job_issues`, `production_job_logs`, `production_job_notes` (append-only).
- `quality/`: `quality_inspections` (IQC and OQC in one table, `inspection_no`), `quality_inspection_results`, `quality_inspection_evidences` (`quality_evidence_kind`), `ncrs`, `ncr_logs`, `ncr_cost_lines` (`ncr_cost_kind`), `quality-enums.ts`.
- `inventory/`: `inventory_receipts` (+ `_items`), `inventory_issues` (+ `_items`, `inventory_issue_files`), `inventory_adjustments` (+ `_items`), `inventory_requisitions` (+ `_items`), `inventory_transactions` (ledger, only POSTED docs write), `inventory_balances` (per item), `outbound_orders` (+ `_items`), `outsourcing_orders` (+ `_items`), `outsourcing_receipts` (+ `_items`), `supplier_returns` (+ `supplier_return_files`), `inventory-documents.ts` (shared status enum).
- `purchase-requests/`: `purchase_requests` (FK `department_id`), `purchase_request_items` (FK `purchase_request_id`, `item_id`).
- `purchasing/`: `purchase_quotations`, `purchase_quotation_items` (FK `quotation_id`, `item_id`), `purchase_quotation_item_suppliers` (supplier quotes, FK `supplier_id`) + `_supplier_files`, `purchase_quotation_item_allocations` (links to `purchase_request_items`), `purchase_orders` (DMH; FK `supplier_id`, `quotation_id`), `purchase_order_items` (FK `purchase_order_id`, `purchase_request_item_id`), `payment_requests` (FK `purchase_order_id`), `payment_request_logs`.

## Core chain (ASCII ER)

```
clients --< orders (SO) --< order_items
              |                 |
              v                 v
        production_orders (LSX) --< production_order_items (order_item_id)
              |   ^ ncr_id (REWORK/REMAKE LSX born from an NCR; source_type NCR)
              v   |
        production_jobs (JOB) --< production_job_bom_items / _operations / _issues
              |  \
              |   +--(production_job_id)--> inventory_receipts (type PRODUCTION; also production_order_id)
              v
   quality_inspections (OQC)  --(production_job_id, production_job_operation_id)
              |  ncr_id <-> ncrs.quality_inspection_id (origin OQC screening NG)
              v
            ncrs --(production_job_id, order_id, client_id, parent_ncr_id self FK)
              |--< ncr_logs, ncr_cost_lines

purchase_requests (PR) --< purchase_request_items
        |                       \  allocations
        v                        v
 purchase_quotations --< purchase_quotation_items --< _item_suppliers (supplier)
        |
        v
 purchase_orders (DMH) --< purchase_order_items (purchase_request_item_id)
        |        \--< payment_requests --< payment_request_logs
        v
 inventory_receipts (type PURCHASE; purchase_order_id, purchase_request_id)
   --< inventory_receipt_items (purchase_order_item_id)
   <-- quality_inspections (IQC; origin_type INVENTORY_RECEIPT + origin_id, purchase_order_id)
   --> on POSTED: inventory_transactions --> inventory_balances
 supplier_returns --> purchase_order / inventory_receipt / outsourcing_receipt (+ quality_inspection_id)
 outsourcing_orders --< items --> outsourcing_receipts --< items (origin OUTSOURCING_RECEIPT_ITEM for IQC)
```

Unverified: exact cardinality of `quality_inspections.origin_id` (polymorphic, no FK) and whether `production_orders.ncr_id` is always set when `source_type = NCR`.

## Status enums (name: values)
- `OrderStatus` (SO): DRAFT, PENDING_CONFIRMATION, REJECTED, AWAITING_PRODUCTION, IN_PROGRESS, COMPLETED, CANCELLED. `OrderItemStatus`: NORMAL, CANCELLED (`orders/orders.ts`, `order-items.ts`).
- `ProductionOrderStatus` (LSX): PENDING, APPROVED, COMPLETED. `ProductionOrderSourceType`: ORDER, NCR. `ProductionOrderNcrAction`: REWORK, REMAKE.
- `ProductionJobStatus` (JOB): PENDING, IN_PROGRESS, WAITING_QC, WAITING_DELIVERY, COMPLETED.
- `QualityInspectionType`: IQC, OQC. `QualityInspectionStatus`: DRAFT, PENDING, IN_PROGRESS, COMPLETED, CANCELLED. `QualityInspectionDecision`: PENDING, PASS, FAIL, HOLD, PARTIAL. `QualityInspectionOriginType`: INVENTORY_RECEIPT, OUTSOURCING_RECEIPT_ITEM, MANUAL (`quality/quality-enums.ts`). Disposition pgEnum `quality_disposition`: CONCESSION, SORT, RETURN, ACCEPT, REWORK, SCRAP (`IqcDisposition` CONCESSION/SORT/RETURN; `OqcDisposition` ACCEPT/REWORK/SCRAP/SORT). Also `IqcStatus` (NOT_INSPECTED, PENDING, WAITING_RETURN, COMPLETED) and `OqcStatus` (NOT_INSPECTED, PENDING, REWORK, COMPLETED); `QcKind` INCOMING/OUTGOING; `IqcResult` PASS/FAIL.
- `NcrStatus`: OPEN, PENDING_APPROVAL, APPROVED, IN_PROGRESS, PENDING_QC, CLOSED, REJECTED. `NcrOriginType`: OQC, MANUAL. `NcrType`: INTERNAL (NCR-NB), CUSTOMER (NCR-KH) (`quality/ncrs.ts`).
- `InventoryDocumentStatus` (receipts/issues, shared): DRAFT, PENDING_IQC, IQC_COMPLETED, PENDING_RECEIPT, POSTED, CANCELLED. Only POSTED writes `inventory_transactions`/`inventory_balances`; the three middle values occur on receipts only. `InventoryReceiptType`: PURCHASE, PRODUCTION, RETURN, OTHER. `InventoryIssueType`: PRODUCTION, SALES, RETURN. `InventoryTransactionType`: RECEIPT, ISSUE, TRANSFER_IN/OUT, PRODUCTION_IN/OUT, ADJUSTMENT_IN/OUT. `InventoryReferenceType`: INVENTORY_RECEIPT, INVENTORY_ISSUE, INVENTORY_ADJUSTMENT, SUPPLIER_RETURN, OUTSOURCING_ORDER, OUTSOURCING_RECEIPT.
- `InventoryRequisitionStatus`: DRAFT, PENDING_APPROVAL, APPROVED, ISSUED, REJECTED, CANCELLED. `OutboundOrderStatus`: DRAFT, PENDING_APPROVAL, PENDING_DELIVERY, DELIVERED, CANCELLED, REJECTED. `OutsourcingOrderStatus`: SENT, PARTIAL, WAITING_QC, COMPLETED, CANCELLED. `OutsourcingReceiptStatus`: POSTED, CANCELLED.
- `PurchaseRequestStatus`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED. `PurchaseQuotationStatus`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED. `PurchaseOrderStatus` (DMH): PENDING_CONFIRMATION, ORDERED, CANCELLED. `PaymentRequestStatus`: DRAFT, PENDING, REJECTED, PAID, CANCELLED.
- Master data: `ItemType` FG/DIRECT, `ItemStatus` ACTIVE/INACTIVE, `BomType` COMPONENT/DIRECT (`bom_node_type`).

## Migrations (`drizzle/`)
- 234 SQL files `0000_*.sql` to `0233_snapshot_item_revision.sql`, named `NNNN_<random_words>.sql` (drizzle-kit auto names; recent ones are hand-named, e.g. `0232_ncr_permissions_and_retire_codes.sql`); `drizzle/meta/_journal.json` has 234 entries (`idx`, `when`, `tag`) plus `NNNN_snapshot.json` for 232 of them (0156 and 0212 have none). Config: `drizzle.config.ts` (schema `src/database/schemas/index.ts`, out `drizzle`, url `DATABASE_URL`, env loaded `.env.${NODE_ENV||local}` then `.env`).
- Scripts (`package.json`): `pnpm db:generate` (drizzle-kit generate), `pnpm db:migrate` (drizzle-kit migrate), `pnpm db:check-drift` (`src/database/check-migration-drift.ts`: compares journal `when` and SHA-256 of each `.sql` against `__drizzle_migrations` in the `development` and `production` DBs, read-only), `db:studio`, `db:reset`, `db:reset:transactions`, `db:seed:supplier-groups` (seed file `src/database/seeds/supplier-groups.seed.ts`; other seeds were removed).
- WARNING: `DATABASE_URL` in `.env.development` / `.env.production` is a remote database. Never run `pnpm db:migrate`, `db:reset*` or any destructive script against remote DBs without explicit user approval; `drizzle-kit` is interactive, ask the user to run it. Default `.env` points to local Docker (`localhost:5433`, Redis `6380`).
