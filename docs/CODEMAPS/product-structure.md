<!-- Generated: 2026-10-15 | Files scanned: 34 | Token estimate: ~3300 -->
# Product structure codemap

Paths under `src/`. Only controllers check permissions; services do not.

## 1. Modules

| Folder (`api/`) | Main files (lines) | Role |
|---|---|---|
| items | items.controller 194, items.service 992, items.import 174, items.export 69 | Item master, import/export, copy with BOM, DIRECT demand explosion |
| item-units | service 118, controller 74 | Secondary unit + conversion factor per item |
| units | service 139, controller 79 | Unit master (ĐVT) |
| boms | service 595, controller 79, bom-tree.util 43 | BOM tree (`bom_items`), lazy `boms` header |
| bom-directs | service 76, controller 31 | Read-only DIRECT children of a node |
| bom-operations | service 181, controller 108 | Steps (as-used) on a COMPONENT node |
| routings | service 230, controller 86 | Level-0 steps of the FG itself (`routing_operations`) |
| operations | service 332, controller 156, operation-access.service 81 | Operation master, assignments, access scope |

Schemas: `database/schemas/items/{items 168, bom-items 162, boms 41, bom-operations 74, routing-operations 74, item-units 63, item-files 44}.ts`, `units/units.ts` 45, `operations.ts` 120.
bom-operations, routings, bom-directs modules import `BomsModule`, reusing `BomsService.ensureItemExists` (boms.service.ts:328), `ensureBomItemInBom` (:504), `ensureBomItemCanHaveOperations` (:487), `getOrCreateBomId` (:567).

## 2. Routes (Controller.method line -> Service.method line)

Items (`items.controller.ts` -> `items.service.ts`), 11 routes:
| Route | Permission | Handler -> Service | Writes |
|---|---|---|---|
| GET /items | items:read | :51 -> getItems :93 | - |
| GET /items/options | items:read | :64 -> getItemOptions :210 | - |
| GET /items/export | items:read | :77 -> exportItems :152 | - |
| GET /items/import-template | items:create | :87 -> downloadImportTemplate :323 | - |
| POST /items/import | items:create | :112 -> importItems :335 | items |
| GET /items/:itemId | items:read | :125 -> getItem :240 | - |
| POST /items | items:create | :135 -> createItem :263 | items, item_files |
| PATCH /items/:itemId | items:update | :148 -> updateItem :512 | items, item_files (replace-all :609) |
| GET /items/:itemId/issues | items:read | :163 -> getItemIssues :630 | - |
| DELETE /items/:itemId | items:delete | :176 -> deleteItem :560 | items.deletedAt (soft) |
| POST /items/:itemId/copy | items:copy | :187 -> copyItem :735 | items, item_files, boms, bom_items, bom_operations, routing_operations (copyBomTree :847) |

Item units (`items/:itemId/units`, `item-units.controller.ts` -> `item-units.service.ts`), 4:
| GET | items:read | :32 -> getItemUnits :21 | - |
| POST | items:update | :42 -> createItemUnit :35 | item_units |
| PATCH :unitId | items:update | :54 -> updateItemUnit :56 | item_units |
| DELETE :unitId | items:update | :68 -> deleteItemUnit :70 | item_units |

Units (`units.controller.ts` -> `units.service.ts`), 5:
| GET /units | public (`@ApiPublic`) | :33 -> getUnits :21 | - |
| GET /units/:unitId | public | :42 -> getUnit :44 | - |
| POST /units | items:create | :52 -> createUnit :52 | units |
| PATCH /units/:unitId | items:update | :62 -> updateUnit :66 | units |
| DELETE /units/:unitId | items:update | :76 -> deleteUnit :79 (hard delete) | units |

BOM (`items/:itemId/bom`, `boms.controller.ts` -> `boms.service.ts`), 4:
| GET | items:read | :34 -> getBomItem :61 | - |
| POST items | items:bom-manage | :45 -> createBomItem :192 | boms (lazy), bom_items; deletes DIRECT siblings :437 |
| PATCH items/:bomItemId | items:bom-manage | :59 -> updateBomItem :281 | bom_items |
| DELETE items/:bomItemId | items:bom-manage | :73 -> deleteBomItem :316 | bom_items (cascade children, bom_operations) |

BOM directs (`items/:itemId/bom/items/:bomItemId/directs`), 1: GET | items:read | `bom-directs.controller.ts:24` -> `getBomDirects` (`bom-directs.service.ts:22`).

BOM operations (`.../bom/items/:bomItemId/operations`, `bom-operations.controller.ts` -> `bom-operations.service.ts`), 4:
| GET | items:read | :38 -> getBomOperations :26 | - |
| POST | items:bom-manage | :57 -> createBomOperation :68 | bom_operations |
| PATCH :stepId | items:bom-manage | :77 -> updateBomOperation :95 | bom_operations |
| DELETE :stepId | items:bom-manage | :97 -> deleteBomOperation :118 | bom_operations |

Routings (`items/:itemId/operations`, `routings.controller.ts` -> `routings.service.ts`), 4:
| GET | items:read | :38 -> getOperations :35 | - |
| POST | items:bom-manage | :52 -> createOperation :89 | boms (lazy), routing_operations |
| PATCH :stepId | items:bom-manage | :66 -> updateOperation :133 | routing_operations |
| DELETE :stepId | items:bom-manage | :80 -> deleteOperation :154 | routing_operations |

Operations (`operations.controller.ts` -> `operations.service.ts`), 9:
| GET /operations | operations:read | :43 -> getOperations :53 | - |
| GET /operations/options | operations:read | :57 -> getOperationOptions :85 | - |
| GET :operationId | operations:read | :69 -> getOperation :106 | - |
| GET :operationId/assignments | operations:read | :83 -> getOperationAssignments :121 | - |
| GET :operationId/assignments/ids | operations:read | :98 -> getOperationAssignmentIds :183 | - |
| POST /operations | operations:create | :110 -> createOperation :194 | operations |
| PATCH :operationId | operations:update | :123 -> updateOperation :211 | operations |
| PUT :operationId/assignments | operations:update | :137 -> setOperationAssignments :229 | operation_assignments (delete+insert in tx) |
| DELETE :operationId | operations:delete | :151 -> deleteOperation :250 | operations.deletedAt (soft) |

Total 42 routes (11+4+5+4+1+4+9+4).

## 3. Data model and flows

Enums: `ItemType` FG|DIRECT (items.ts:22, pg `item_type`); `BomType` COMPONENT|DIRECT (bom-items.ts:32, pg `bom_node_type`, column `bom_items.type`); `OperationType` INHOUSE|OUTSOURCE (operations.ts:20, pg `operation_type`); `ProductionJobBomItemType` FG|COMPONENT|DIRECT (production/production-job-bom-items.ts:26). The value is DIRECT in code (not consumable/material).

Catalog and BOM:

    clients, suppliers, units, files
         |
       items (type FG|DIRECT, revision, unitId NOT NULL, soft delete, unique active (code,revision) via uq_items_code_revision_active)
         |-- item_files            (replace-all attachments)
         |-- item_units            (itemId,unitId unique; conversionFactor > 0; base unit = items.unitId, factor 1 implicit)
         |-- boms (1 per item, unique item_id; LAZY header = "Level 0" anchor, not a bom_items row)
               |-- routing_operations  (Level-0 steps of the FG: bomId, operationId, type, sortOrder)
               |-- bom_items   (parentId NULL = directly under Level 0; level 1-based; quantity numeric(12,6) > 0)
                     COMPONENT: itemId NULL, code+name typed on the row, optional unitId/imageFileId, never reusable
                     DIRECT   : itemId -> items(type DIRECT), code/name/unit/image NULL (read via join), always a leaf
                     isOffStructure (DIRECT only): attachable next to COMPONENT siblings, not deleted when a COMPONENT child is added
                     checks: chk_bom_items_node_shape, chk_bom_items_off_structure_direct (bom-items.ts)
                     |-- bom_operations (COMPONENT only: bomItemId, operationId, type, sortOrder; repeats allowed)
    operations (code unique, type default suggestion, status, soft delete) <-- operation_assignments (operationId,userId unique) = team staffing

Step lane: `bom_operations.type` / `routing_operations.type` is the real INHOUSE|OUTSOURCE choice; `operations.type` is only the prefilled default and the `?type=OUTSOURCE` filter (operations.ts:12-19). `operationId` is immutable (update edits sortOrder/note only).

GET BOM tree (boms.service.ts:61): returns [] if no header; Level 0 is NOT in the response (read item via GET /items/:itemId and steps via routings). `code`/`name` = coalesce(row, item) :87; unit/image coalesce(item, row) :102-108; sorted by `buildBomItemPaths`/`compareBomPaths` (bom-tree.util.ts); operations in one query :128; off-structure DIRECT rows follow their owner and reuse its path :118-185.

DIRECT demand (items.service.ts:630): multiplier = parent x quantity, rounded to scale 6 per step, summed per DIRECT item.

Snapshot into a JOB (production-jobs, not at start):

    LSX approved (production-orders.service.ts:500) or NCR rework (ncrs.service.ts:390)
      -> ProductionJobsService.createJobs (production-jobs.service.ts:703, 1 JOB per FG item, same tx)
      -> createJobSnapshot (production-job-snapshot.query.ts:136) <- buildJobPlan :65 (reads LIVE master data x job.quantity)
           buildPlanBomItems :203  bom_items -> production_job_bom_items (new ids, plannedQuantity = parent x qty; Level 0 becomes a
                                   separate FG node, only if Level 0 has steps)
           buildPlanOperations :295 bom_operations + routing_operations -> production_job_operations (code/name/type copied)
           buildPlanIssues :357    sum DIRECT nodes per item -> production_job_issues (+ get-or-create production_job_items/_units :442/:491)
      rework: keepReworkOperations :110 keeps chosen operations + last FG step, issues = []
    PENDING job reads its stored production_job_issues rows (getProductionJobBom, production-jobs.service.ts:~307); buildJobPlan runs only in createJobSnapshot and the read-only NcrsService.getNcrOperations preview (ncrs.service.ts:130); reloadSnapshot (:747) = clearJobSnapshot :182 + re-snapshot; startJob (:808) only
    back-fills when snapshotLoadedAt is null (:821). Schema comment in production-job-bom-items.ts says "built at start"; stale, code above is the truth.

## 4. Key rules and error codes (`constants/error-code.constant.ts`)

- E007 item not found: boms.service.ts:337, items.service.ts:255,925.
- E008 duplicate (code,revision): items.service.ts validateCodeRevisionUniqueness :931, plus 23505 backstop :316,:471,:554,:794.
- E111 no BOM/routing on DIRECT: boms.service.ts:199, routings.service.ts:96.
- E276 DIRECT needs a user-set `code` (:268, copy :806); E277 FG copy needs `revision` :816; E295 FG needs `clientId` :279 (422).
- E255 item used by order_items / production_order_items / production_jobs blocks delete: items.service.ts:590 (BOM usage does not).
- E291/E292 import file / rows invalid: items.service.ts:479,:458.
- E050 bom node/BOM not found: boms.service.ts:495,:535,:555; E051 node not in this item's BOM: :515,:521.
- E052 parent is DIRECT leaf (no children): boms.service.ts:405; E273 attach DIRECT beside a COMPONENT sibling (unless isOffStructure): :431.
- E063 DIRECT cannot hold bom_operations: boms.service.ts:498.
- E055 COMPONENT quantity must be integer (DIRECT may be fractional): boms.service.ts:392.
- E245 same DIRECT item twice under one parent: boms.service.ts:481 (backed by unique indexes uq_bom_items_*).
- E270 itemId is not DIRECT: boms.service.ts:370; E271 invalid node payload / DIRECT code,name / DIRECT unitId,imageFileId: :355,:295,:384.
- Adding a COMPONENT silently deletes non-off-structure DIRECT siblings (:437).
- E109 step not found: bom-operations.service.ts:144,:178; routings.service.ts:175,:210,:225. E046 operation not found: bom-operations.service.ts:161, routings.service.ts:193, operations.service.ts:113,:268.
- E047 operation code exists: operations.service.ts:205,:292. E248 operation in use by bom_operations, delete blocked: :307. E278 assignees must be WORKING and not deleted: :329.
- E279 (403) operation not assigned to user: operation-access.service.ts:78; `getAllowedOperationIds` :29 returns null for super permission or `production-execution:read-all`.
- E011 unit not found: units.service.ts:92, item-units.service.ts:101; E241 unit code exists :60,:114; E242 unit in use (items, production_job_units) :136.
- E262 item unit not found: item-units.service.ts:115; E263 duplicate unit or same as base unit: :43,:50.

Observed gaps (unverified as intended): `ensureOperationIsDeletable` (operations.service.ts:299) checks only `bom_operations`, not `routing_operations` (soft delete skips the restrict FK; its comment says that table is gone, yet it exists). `ensureUnitNotInUse` (units.service.ts:121) checks items and production_job_units only, not bom_items.unitId or item_units.unitId .

## 5. Cross-domain links

- production-jobs: snapshot above; `items` FKs from `order_items`, `production_order_items`, `production_jobs` (E255 guard).
- purchasing: `startJob` -> `getShortageItems` (production-jobs.service.ts:865) -> `PurchaseRequestsService.createShortageRequest` (purchase-requests.service.ts:761) using `production_job_issues`; request lines must be DIRECT (E148, purchase-requests.service.ts:752).
- inventory: balances filter by `items.type` (inventory.service.ts:59, inventory-directs.service.ts:54, inventory-products.service.ts:82); unit via `items.unitId` (inventory-receipts.write.ts:92).
- outsourcing: `outsourcing-orders.service.ts` and `oqc.query.ts` use `OperationType.OUTSOURCE`; production-execution scopes by `OperationAccessService`.
- item_units conversion: no reader outside `api/item-units` found by grep; schema comment says stock lines snapshot the factor (unverified).
- Docs cited in code comments (`docs/decisions/*`, `docs/domains/*`) are absent in this checkout.
