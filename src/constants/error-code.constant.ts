export enum ErrorCode {
  // Common Validation
  V000 = 'common.validation.error',

  // Validation
  V001 = 'user.validation.is_empty',
  V002 = 'user.validation.is_invalid',

  // Error
  E001 = 'credential.error.username_or_email_exists',
  E002 = 'credential.error.not_found',
  E003 = 'credential.error.email_exists',
  E004 = 'credential.error.invalid_credentials',
  E005 = 'user.error.code_exists',
  // Chưa từng có nơi ném — dự phòng ở thiết kế `products` cũ, không sống lại ở `items`
  // (`docs/decisions/items-merge.md`).
  E006 = 'item.error.locked',
  E007 = 'item.error.not_found',
  E008 = 'item.error.code_exists',
  E009 = 'client.error.not_found',
  // E010 (product_group.error.not_found) stays reserved — nhóm hàng hoá (product_groups/
  // material_groups) bị bỏ hẳn khi gộp `items` (`docs/decisions/items-merge.md`); `type` là thứ
  // duy nhất phân loại.
  E011 = 'unit.error.not_found',
  E012 = 'user.error.not_found',
  E013 = 'user.error.id_number_exists',
  E014 = 'department.error.not_found',
  E015 = 'position.error.not_found',
  E016 = 'upload.error.invalid_file',
  E017 = 'upload.error.file_too_large',
  E018 = 'user.error.resigned',
  // Suppliers domain. Retired when the module was removed earlier on 2026-07-20, then restored
  // with their original meanings when it was rolled back the same day — so no client ever saw
  // these codes point at anything else.
  E019 = 'supplier.error.not_found',
  E020 = 'supplier.error.code_exists',
  E021 = 'supplier_group.error.not_found',
  E022 = 'supplier.error.tax_code_exists',
  // Only throw site is SuppliersService (country ref on a supplier).
  E023 = 'country.error.not_found',
  E024 = 'client.error.code_exists',
  E025 = 'client.error.tax_code_exists',
  E026 = 'client_group.error.not_found',
  E027 = 'role.error.not_found',
  E028 = 'role.error.code_exists',
  E029 = 'role.error.in_use',
  E030 = 'role.error.system_readonly',
  E031 = 'role.error.invalid_permission',
  E032 = 'user.error.no_credential',
  E033 = 'auth.error.forbidden',
  E034 = 'role.error.elevation_forbidden',
  // E035 (material.error.not_found) and E036 (material.error.code_exists) stay reserved —
  // `materials` merged into `items`; `E007`/`E008` cover the same cases now
  // (`docs/decisions/items-merge.md`).
  // E037 (material_group.error.not_found) stays reserved — nhóm hàng hoá bỏ hẳn, cùng lý do E010.
  // E038/E039 (material_group.error.code_exists/in_use) stay reserved with their original
  // meanings — the resource they'd guard no longer exists.
  // E040 (material.error.client_required) stays reserved — `MaterialType` (INTERNAL/CLIENT) bị bỏ
  // khi gộp `items`; `clientId` giờ là field tự do, không còn ràng buộc theo `type`.
  // E041 (material.has_transactions) stays reserved — xoá item giờ luôn là soft delete
  // (`deletedAt`), không còn kiểm "đang được dùng" trước khi xoá, cùng khuôn `clients`/`orders`/
  // `suppliers`.
  E042 = 'file.error.not_found',
  // The unit exists but isn't assignable to this kind of entity (e.g. `Mét` on an FG) —
  // deliberately distinct from E011 so the client can tell a bad id from a wrong-scope unit.
  E043 = 'unit.error.scope_mismatch',
  // Download-URL signature failures. Kept distinct on purpose: E045 means "ask the API for the
  // entity again to get a fresh link" (routine, the URL simply aged out), while E044 means the
  // link was tampered with or minted elsewhere — worth surfacing differently, and worth logging.
  E044 = 'file.error.invalid_signature',
  E045 = 'file.error.url_expired',
  E046 = 'operation.error.not_found',
  // E047 (operation.error.code_exists) stays reserved — its only throw site was
  // `OperationsService.createOperation`/`updateOperation`, removed when `operations` became a
  // read-only catalogue (list only, no create/update/delete). E046 stays live:
  // `RoutingsService`/`BomOperationsService` independently throw it when a routing step
  // references a missing operation.
  E047 = 'operation.error.code_exists',
  // E048/E049 (product_revision not_found/number_exists) stay reserved — the product-revisions
  // module was removed in favor of whole-item copy/clone (`POST /items/:id/copy`); no current
  // throw site uses them.
  E050 = 'bom_item.error.not_found',
  // Cũng dùng cho `bomItemId` của một dòng `bom_operations` (công đoạn as-used) không thuộc đúng
  // BOM của item trên URL — cùng khuôn kiểm tra (`BomsService.ensureBomItemInBom`), dùng chung mã
  // vì cùng resource `bom_items`.
  E051 = 'bom_item.error.parent_not_found',
  // `bom_items` giờ chứa cả node WIP lẫn lá RM (`docs/decisions/items-merge.md`) — RM là lá bắt
  // buộc, không được nhận node con. Sống lại từ chỗ reserved khi vật tư còn ở bảng riêng
  // `bom_materials`.
  E052 = 'bom_item.error.parent_is_leaf',
  E053 = 'bom_item.error.item_not_wip',
  E054 = 'bom_item.error.cycle_detected',
  // WIP bắt buộc SL nguyên (cấu trúc lắp ráp); RM được phép SL lẻ (định mức vật tư) — validate ở
  // `BomsService.ensureQuantityValid`, theo `type` của item đang thêm/sửa. Sống lại cùng lý do
  // E052.
  E055 = 'bom_item.error.quantity_not_integer',
  E056 = 'routing_operation.error.not_found',
  E057 = 'order.error.not_found',
  E058 = 'order.error.code_exists',
  // Client/staff/item refs on an order. Retired when the module was pared down to a header-only
  // table on 2026-07-27, restored with their original meanings the same day when the module was
  // re-expanded — so no client ever saw these codes point at anything else.
  E059 = 'order.error.client_not_found',
  E060 = 'order.error.staff_not_found',
  E061 = 'order.error.item_not_found',
  // E062 (routing_operation.error.bom_item_not_found) stays reserved — routing as-used theo node
  // sống ở `bom_operations` (dùng chung `E051` qua `BomsService.ensureBomItemInBom`); routing Cấp 0
  // (`routings`/`routing_operations`) không còn ca `bomItemId` để kiểm.
  // RM là lá — không được gắn `bom_operations`. Khác `E052` (lá không được nhận node **con**): đây
  // là lá không được gắn **công đoạn**. Sống lại cùng lý do E052.
  E063 = 'bom_operation.error.leaf_node',
  // `positionId` on a user create/update exists (E015 already passed) but doesn't belong to the
  // effective `departmentId` (the one sent, or the user's current one when only one of the pair
  // is being changed).
  E064 = 'position.error.department_mismatch',
  // A write (PATCH/DELETE) on an order that has reached a terminal state — `COMPLETED` or
  // `CANCELLED`. Every other status (`CONFIRMED`, `IN_PROGRESS`) stays editable.
  E065 = 'order.error.not_editable',
  // E066 (order.error.no_items) stays reserved — it was `POST /orders/:id/confirm`'s
  // zero-NORMAL-lines guard; that endpoint was removed 2026-07-27 along with `OrderStatus.DRAFT`
  // (orders are `CONFIRMED` on creation, no separate confirm step). No current throw site uses it.
  // E067-E073 (stock_receipt.error.*: not_found, code_exists, product_not_found,
  // product_not_finished_good, insufficient_stock, invalid_order_item, reason_type_mismatch) stay
  // reserved — the whole `stock_receipts`/`stock_receipt_items` design (single-table receipt with
  // a `subject`+`type`+`reason` triple) was replaced 2026-08-04 by `inventory_receipts`/
  // `inventory_issues` + a posted ledger (`docs/decisions/stored-inventory-balances.md`). No
  // current throw site uses them; the successor codes are E096-E100/E106-E107.
  // `POST /orders/:orderId/approve` or `/reject` called on an order whose status isn't
  // PENDING_CONFIRMATION — only an order actually submitted for approval can be approved/rejected.
  E074 = 'order.error.invalid_approval_state',
  // Client tried to set `status: AWAITING_PRODUCTION` directly via `POST /orders`/
  // `PATCH /orders/:orderId` — that status is only reachable through `OrdersService.approveOrder`
  // (director-level `orders:approve` permission), never a plain create/update.
  E075 = 'order.error.status_not_settable_directly',
  // `POST /production-orders/:productionOrdersId/approve` gọi trên một LSX mà PO gốc không còn
  // `AWAITING_PRODUCTION`. Trước 2026-07-30 (bản `PATCH`/`issue` cũ) cùng ý nghĩa nhưng không có
  // nhánh throw nào — sống lại cùng luồng duyệt LSX mới.
  E076 = 'production_order.error.order_not_approved',
  // Dự phòng — gắn với "Tạo LSX" (`issueProductionOrders`) đã bỏ 2026-07-30. Luồng thay thế
  // (`approveProductionOrder`) dùng `E083` cho ca tương đương, không tái dùng mã này.
  E077 = 'production_order.error.already_issued',
  // `PATCH /production-orders/:productionOrdersId` gửi `orderItemId` không thuộc chính LSX đó.
  // Trước 2026-07-30 gắn với `PATCH` "Lưu lại" cũ (đã bỏ), không có nhánh throw — sống lại cùng
  // route `updateProductionOrder` mới (khác khoá tra cứu + semantics partial, xem
  // `docs/workflows/production-order-approval.md`).
  E078 = 'production_order.error.invalid_order_item',
  // Dự phòng — gắn với `POST /production-orders/:orderId/issue` đã bỏ 2026-07-30.
  E079 = 'production_order.error.no_items',
  // `PATCH /orders/:orderId` cố replace `items` trên một đơn mà LSX (`production_orders`, header)
  // đã `APPROVED` — duyệt LSX là chốt kế hoạch, sửa `order_items` sau đó sẽ làm lệch số liệu đã
  // ghi. Trước 2026-07-30 kiểm tra `ISSUED` (gắn với "Tạo LSX", đã bỏ) — nay kiểm tra `APPROVED`
  // (gắn với `approveProductionOrder`), sống lại cùng luồng duyệt LSX mới.
  E080 = 'order.error.items_locked_by_production',
  // Header `production_orders` không tồn tại cho một PO đang trong phạm vi LSX — về lý thuyết
  // không xảy ra vì `OrdersService.approveOrder` luôn seed header cùng lúc duyệt PO; giữ như một
  // chốt chặn dữ liệu bất nhất, không phải luồng nghiệp vụ bình thường.
  E081 = 'production_order.error.not_found',
  // `GET /production-jobs/:jobId` với id không tồn tại.
  E082 = 'production_job.error.not_found',
  // `POST /production-orders/:productionOrdersId/approve` gọi trên một LSX không còn `PENDING`
  // (đã `APPROVED` từ trước) — duyệt chỉ hợp lệ một lần.
  E083 = 'production_order.error.invalid_approval_state',
  // `PATCH /production-orders/:productionOrdersId` gọi trên một LSX không còn `PENDING` (đã
  // `APPROVED`) — sửa số lượng sản xuất chỉ hợp lệ trước khi chốt LSX.
  E084 = 'production_order.error.not_editable',
  // E085/E086 (stock_receipt.error.material_not_found/line_target_mismatch) stay reserved —
  // retired with E067-E073, same reason.
  // `start` gọi trên một Job đang không ở trạng thái hợp lệ cho hành động đó (xem sơ đồ chuyển
  // trạng thái ở `docs/domains/production.md`, mục Lifecycle).
  E087 = 'production_job.error.invalid_status_transition',
  // `PATCH /production-jobs/:jobId/operations/:operationId` gửi `completedQuantity` vượt SL kế
  // hoạch của node BOM cha (tính lúc đọc, không lưu cột) — tái dùng slot đã để dành từ thiết kế
  // report cũ (job-level, đã gỡ), đổi phạm vi sang từng công đoạn.
  E088 = 'production_job_operation.error.completed_exceeds_planned',
  // E089 (production_job.error.empty_report) vẫn để trống — không còn nơi ném, dự phòng nếu sau
  // này hồi sinh báo sản lượng ở mức Job.
  // `PATCH /orders/:orderId` gọi trên một đơn đang `PENDING_CONFIRMATION` — đơn đang chờ Giám đốc
  // duyệt/từ chối, khoá để tránh đổi dữ liệu ngay trong lúc chờ duyệt. Khác `E074` (ném ở route
  // approve/reject khi đơn *không* ở trạng thái này).
  E090 = 'order.error.locked_pending_confirmation',
  // `operationId` trên `PATCH /production-jobs/:jobId/operations/:operationId` không tồn tại hoặc
  // không thuộc đúng `jobId`.
  E091 = 'production_job_operation.error.not_found',
  E092 = 'warehouse.error.not_found',
  E093 = 'warehouse.error.code_exists',
  // Kho `INACTIVE` không nhận phiếu nhập/xuất mới — lập/`post` phiếu trên kho này bị chặn.
  E094 = 'warehouse.error.inactive',
  // `DELETE /warehouses/:warehouseId` khi kho còn phiếu/bút toán/tồn tham chiếu tới — FK là
  // `restrict`, kiểm trước để trả 409 sạch thay vì 500 thô.
  E095 = 'warehouse.error.in_use',
  // Dùng chung cho cả `inventory_receipts` lẫn `inventory_issues` — phiếu không tồn tại.
  E096 = 'inventory_document.error.not_found',
  E097 = 'inventory_document.error.code_exists',
  // `PATCH`/`DELETE`/`post` gọi trên phiếu không còn `DRAFT`, hoặc `cancel` gọi trên phiếu đã
  // `CANCELLED`.
  E098 = 'inventory_document.error.invalid_status_transition',
  // E099 (inventory_document.error.item_target_mismatch) stays reserved — dòng phiếu giờ chỉ có
  // một `itemId` (không còn cặp `productId`/`materialId` + `itemType`), nên "sai target" bất khả
  // thi (`docs/decisions/items-merge.md`).
  // `itemId` trên dòng phiếu không tồn tại.
  E100 = 'inventory_document.error.item_not_found',
  E101 = 'class.error.teacher_not_found',
  E102 = 'class.error.invalid_teacher_assignment',
  E103 = 'class.error.forbidden',
  E104 = 'class.error.unique_code_generation_failed',
  E105 = 'class.error.not_found',
  // `post` (nhập hoặc xuất) sẽ làm `inventory_balances.quantity` của một mặt hàng xuống dưới 0 —
  // đánh số tiếp sau E100, nhảy qua khối E101-E105 (dead code của sản phẩm khác) để không tái
  // dùng số đã cấp phát.
  E106 = 'inventory_document.error.insufficient_stock',
  // Tham chiếu tuỳ chọn trên phiếu (`supplierId`/`purchaseRequestId`/`productionOrderId`/
  // `productionJobId`/`departmentId`/`requestedBy`/`orderItemId`) không tồn tại.
  E107 = 'inventory_document.error.invalid_reference',
  // E108 (bom_material.error.not_found) stays reserved — `bom_materials` merged into `bom_items`;
  // `E050` covers "node not found" for both node types now (`docs/decisions/items-merge.md`).
  // `PATCH`/`DELETE` một dòng `bom_operations` không tồn tại đúng node.
  E109 = 'bom_operation.error.not_found',
  // `POST /items/:itemId/copy` gọi trên item `type=RM` — vật tư không có cây BOM để nhân bản.
  E110 = 'item.error.cannot_copy_raw_material',
  // RM không có BOM (`BomsService`) hoặc routing Cấp 0 (`RoutingsService`) — chỉ FG/WIP mới
  // có cấu trúc/công đoạn của chính nó.
  E111 = 'item.error.raw_material_not_allowed',
  E112 = 'purchase_request.error.not_found',
  E113 = 'purchase_request_item.error.not_found',
  E114 = 'purchase_request.error.not_editable',
  E115 = 'purchase_request_item.error.last_item',
  E116 = 'purchase_request.error.invalid_approval_state',
  E117 = 'purchase_quotation.error.not_found',
  E118 = 'purchase_quotation.error.invalid_status_transition',
  E119 = 'purchase_quotation_item.error.not_found',
  E120 = 'purchase_quotation.error.missing_unit_price',
  E121 = 'purchase_order.error.not_found',
  E122 = 'purchase_order.error.invalid_status_transition',
  E123 = 'purchase_order_item.error.not_found',
  E124 = 'purchase_order.error.has_posted_receipts',
  E125 = 'purchase_ledger.error.line_not_purchasable',
  E126 = 'purchase_ledger.error.line_already_ordered',
  E127 = 'purchase_order.error.receipt_item_mismatch',
  // Hai dòng cùng `purchaseRequestItemId` trong một payload tạo báo giá/đơn mua.
  E128 = 'purchase_quotation.error.duplicate_request_item',
  V003 = 'common.error.too_many_requests',
}
