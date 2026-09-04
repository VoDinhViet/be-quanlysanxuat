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
  // Nghỉ hưu — download URL không còn ký/hết hạn (public link vĩnh viễn), không còn throw site
  // nào. Giữ comment, không tái sử dụng số.
  E044 = 'file.error.invalid_signature',
  E045 = 'file.error.url_expired',
  E046 = 'operation.error.not_found',
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
  // Nghỉ hưu — `orders.code` không còn nhận giá trị tay từ client, luôn sinh atomic qua
  // `document_sequences` (`docs/architecture.md`). Giữ comment, không tái sử dụng số.
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
  // Client tried to set `status: AWAITING_PRODUCTION`/`REJECTED` directly via `POST orders`/
  // `PATCH /orders/:orderId` — both are only reachable through `OrdersService.approveOrder`/
  // `rejectOrder` (director-level `orders:approve` permission), never a plain create/update.
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
  // Nghỉ hưu 2026-08-25 — thay bằng `E252` (so cả `completedQuantity + rejectedQuantity`, bao luôn
  // trường hợp cũ vì `rejectedQuantity >= 0`) khi thêm SL NG cho `updateProductionJobOperation`.
  // Giữ comment, không tái sử dụng số.
  E088 = 'production_job_operation.error.completed_exceeds_planned',
  // E089 (production_job.error.empty_report) vẫn để trống — không còn nơi ném, dự phòng nếu sau
  // này hồi sinh báo sản lượng ở mức Job.
  // `PATCH /orders/:orderId` gọi trên một đơn đang `PENDING_CONFIRMATION` — đơn đang chờ Giám đốc
  // duyệt/từ chối, khoá để tránh đổi dữ liệu ngay trong lúc chờ duyệt. Khác `E074` (ném ở route
  // approve/reject khi đơn *không* ở trạng thái này).
  E090 = 'order.error.locked_pending_confirmation',
  // `jobOperationId` trên `POST /production-execution/operations/:jobOperationId/reports` không
  // tồn tại.
  E091 = 'production_job_operation.error.not_found',
  // E092 (warehouse.error.not_found) stays reserved — bảng `warehouses` bỏ hẳn, hệ thống chỉ 1 kho
  // vật lý duy nhất (`docs/decisions/single-warehouse.md`).
  // E093 (warehouse.error.code_exists) stays reserved — cùng lý do E092.
  // E094 (warehouse.error.inactive) stays reserved — warehouses.status (ACTIVE/INACTIVE) bỏ hẳn
  // trước cả khi bỏ bảng, kho hoạt động 24/7 nên không có khái niệm đóng/mở; check nó từng bảo vệ
  // không còn tồn tại.
  // E095 (warehouse.error.in_use) stays reserved — cùng lý do E092.
  // Dùng chung cho `inventory_receipts`/`inventory_issues`/`inventory_adjustments` — phiếu không
  // tồn tại.
  E096 = 'inventory_document.error.not_found',
  // Nghỉ hưu — `code` không còn cho client tự truyền trên `create`, luôn server tự sinh qua
  // `document_sequences` (atomic, không thể trùng). Giữ số, không tái sử dụng.
  E097 = 'inventory_document.error.code_exists',
  // `PATCH`/`DELETE`/`post` gọi trên phiếu không còn `DRAFT`, hoặc `cancel` gọi trên phiếu đã
  // `CANCELLED` — dùng chung cho `inventory_receipts`/`inventory_issues`/`inventory_adjustments`.
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
  // Nghỉ hưu — dành cho `POST /purchase-ledger/:id/cancel` thuộc thiết kế 7-trạng-thái ban đầu,
  // chưa từng triển khai (`purchase-ledger` chỉ có `GET`, `docs/domains/purchasing.md`). Giữ
  // comment, không tái sử dụng số.
  E126 = 'purchase_ledger.error.line_already_ordered',
  E127 = 'purchase_order.error.receipt_item_mismatch',
  // Hai dòng cùng `purchaseRequestItemId` trong một payload tạo báo giá/đơn mua.
  E128 = 'purchase_quotation.error.duplicate_request_item',
  // Khác `E128`: E128 là trùng dòng ĐXMH giữa các dòng của một báo giá; E129 là trùng NCC giữa các
  // mục con (nhiều NCC chào giá) của cùng một dòng vật tư.
  E129 = 'purchase_quotation.error.duplicate_item_supplier',
  // Gửi duyệt khi một dòng vật tư chưa có NCC nào.
  E130 = 'purchase_quotation.error.item_without_supplier',
  // Gửi duyệt khi báo giá không có dòng vật tư nào.
  E131 = 'purchase_quotation.error.no_items',
  // Duyệt khi còn dòng vật tư chưa chọn đúng một NCC thắng thầu.
  E132 = 'purchase_quotation.error.supplier_not_selected',
  // Thu hồi báo giá đã duyệt khi PO do nó sinh ra đã chuyển `ORDERED`.
  E133 = 'purchase_quotation.error.order_already_placed',
  // Xác nhận đặt hàng khi PO chưa có ngày giao dự kiến.
  E134 = 'purchase_order.error.missing_expected_date',
  // Xác nhận đặt hàng khi còn dòng chưa có đơn giá. Khác `E120` (cùng nghĩa nhưng ở báo giá).
  E135 = 'purchase_order.error.missing_unit_price',
  E136 = 'purchase_order.error.assigned_user_not_found',
  E137 = 'supplier_return.error.not_found',
  E138 = 'iqc_inspection.error.not_found',
  // `result = PASS` không được kèm `disposition` trên `POST /iqc` (tạo tay) — DB còn giữ
  // `chk_qc_requests_disposition_requires_fail` làm chốt chặn cuối. `confirmIqc` không còn ném mã
  // này — QC toàn quyền quyết định ở luồng "Lưu" (`docs/domains/quality-iqc.md`).
  E139 = 'iqc_inspection.error.disposition_not_allowed_for_pass',
  // Nghỉ hưu — cùng lý do `E097`: `code` không còn cho client tự truyền trên `create`.
  E140 = 'iqc_inspection.error.code_exists',
  // Nghỉ hưu — `confirm` giờ lưu lại được nhiều lần (không còn dùng-một-lần), điều kiện chặn duy
  // nhất chuyển sang `E159`. Giữ comment, không tái sử dụng số.
  E141 = 'iqc_inspection.error.already_inspected',
  // Nghỉ hưu — bảng AQL nay chỉ là gợi ý hiển thị (Ac/Re tham khảo), tra hụt không còn được phép
  // chặn `confirm` nữa (QC tự chọn PASS/FAIL). Giữ comment, không tái sử dụng số.
  E142 = 'iqc_inspection.error.invalid_aql_combination',
  // Nghỉ hưu — `POST /iqc/:iqcId/resolve` đã gộp vào `confirm`, không còn transition riêng nào để
  // chặn ở trạng thái `PENDING`. Giữ comment, không tái sử dụng số.
  E143 = 'iqc_inspection.error.not_pending',
  // `PATCH /iqc/:iqcId` (sửa lại thông tin ngữ cảnh sau confirm) khi `status` còn `NOT_INSPECTED`
  // — dòng phải confirm qua AQL sampling trước đã mới có gì để sửa.
  E144 = 'iqc_inspection.error.not_yet_confirmed',
  // Nhập kho gắn `purchaseOrderId` khi PO chưa `ORDERED` (còn `DRAFT` hoặc đã `CANCELLED`).
  E145 = 'purchase_order.error.not_ordered',
  // Lập ĐXMH tay không kèm dòng nào. Khác `E131` (cùng nghĩa nhưng ở báo giá).
  E146 = 'purchase_request.error.no_items',
  // Hai dòng cùng `itemId` trong một ĐXMH. Khác `E128`: E128 là trùng dòng ĐXMH giữa các dòng
  // của một báo giá.
  E147 = 'purchase_request_item.error.duplicate_item',
  // Dòng ĐXMH trỏ vật tư không phải RM. Nghịch đảo của `E111`, nơi RM mới là loại bị cấm.
  E148 = 'purchase_request_item.error.item_not_raw_material',
  // Dòng ĐXMH phân bổ vào một vật tư nhưng itemId của nó khác itemId của dòng báo giá chứa nó.
  E149 = 'purchase_quotation_item.error.allocation_item_mismatch',
  // Một dòng vật tư trong payload tạo/sửa báo giá không có phân bổ nào về dòng ĐXMH nguồn.
  E150 = 'purchase_quotation_item.error.no_allocations',
  // Xác nhận phiếu nhập không có dòng nào (`confirm`, `items: []` lọt qua ValidationPipe nên phải
  // chặn ở đây, không phải lúc tạo). Phiếu điều chỉnh dùng lại mã này ở `post` — không có bước
  // `confirm` riêng.
  E151 = 'inventory_document.error.no_items',
  // Phiếu nhập yêu cầu IQC nhưng không suy ra được NCC (cả `supplierId` lẫn NCC của PO đều trống) —
  // `chk_qc_requests_incoming_supplier` đòi `supplier_id` khác null cho dòng `kind = INCOMING`.
  E152 = 'inventory_receipt.error.missing_supplier_for_iqc',
  // `post` phiếu đang `PENDING_IQC` khi còn phiếu IQC chưa `COMPLETED`.
  E153 = 'inventory_receipt.error.iqc_not_completed',
  // SL nhận (cộng dồn mọi phiếu đã xác nhận) vượt SL đặt của dòng đơn mua.
  E154 = 'purchase_order_item.error.received_quantity_exceeded',
  // E155 (purchase_order.error.missing_receipt_warehouse) stays reserved — `receiptWarehouseId` bỏ
  // hẳn cùng đợt bỏ khái niệm kho (`docs/decisions/single-warehouse.md`).
  // Xác nhận đặt hàng khi chưa chọn điều khoản thanh toán — cần có để tính `dueDate` lúc PO đạt
  // COMPLETED và tự sinh yêu cầu thanh toán.
  E156 = 'purchase_order.error.missing_payment_term',
  E157 = 'payment_request.error.not_found',
  // `mark-paid`/`cancel` khi yêu cầu thanh toán không còn `PENDING`.
  E158 = 'payment_request.error.invalid_status_transition',
  // Lưu lại kết quả/quyết định QC (`POST /iqc/:iqcId/confirm`) khi dòng đã `WAITING_RETURN` —
  // đường trả NCC đã chốt (đã sinh `supplier_returns`), không cho đổi kết quả nữa.
  E159 = 'iqc_inspection.error.locked_for_return',
  // Chọn `disposition = SORT` nhưng `sortOkQty + sortNgQty` không khớp `quantity` của dòng IQC.
  E160 = 'iqc_inspection.error.sort_quantity_mismatch',
  // Gửi `sortOkQty`/`sortNgQty` khi `disposition` không phải `SORT`.
  E161 = 'iqc_inspection.error.sort_quantity_not_allowed',
  // `disposition = SORT` nhưng thiếu `sortOkQty`/`sortNgQty`.
  E162 = 'iqc_inspection.error.sort_quantity_required',
  // E163 (iqc_inspection.error.missing_warehouse_for_return) stays reserved — `supplier_returns`
  // không còn cột kho để suy, `disposition = SORT`/`RETURN` giờ luôn sinh được phiếu trả
  // (`docs/decisions/single-warehouse.md`).
  // Hoàn tất phiếu IQC sau khi phiếu trả NCC liên kết được `post` (`SupplierReturnsService.
  // postSupplierReturn`) khi dòng IQC không còn `WAITING_RETURN`.
  E164 = 'iqc_inspection.error.not_waiting_return',
  E165 = 'outsourcing_order.error.not_found',
  // E166 (outsourcing_order.error.operation_not_outsource) dự phòng — trước ném khi snapshot
  // `productionJobOperationId` không phải `type = OUTSOURCE`; `createOutsourcingOrder` không còn
  // resolve/validate công đoạn phía server, client gửi thẳng các cột của dòng
  // (`docs/decisions/outsourcing-no-draft.md`).
  E166 = 'outsourcing_order.error.operation_not_outsource',
  // E167 (outsourcing_order.error.job_not_in_progress) dự phòng — cùng lý do bỏ như E166; trước
  // ném khi Job của công đoạn chưa/không còn `IN_PROGRESS`.
  E167 = 'outsourcing_order.error.job_not_in_progress',
  // E168 (outsourcing_order.error.item_not_resolvable) dự phòng — cùng lý do bỏ như E166; trước
  // ném khi node BOM snapshot mất `itemId`.
  E168 = 'outsourcing_order.error.item_not_resolvable',
  // Huỷ OS-OUT đã `POSTED` khi còn `outsourcing_receipts` nào chưa `CANCELLED` trỏ vào.
  E169 = 'outsourcing_order.error.has_receipts',
  E170 = 'outsourcing_receipt.error.not_found',
  // Tạo OS-IN khi dòng OS-OUT nguồn đã `CANCELLED`.
  E171 = 'outsourcing_receipt.error.order_not_posted',
  // SL nhận (cộng dồn mọi dòng OS-IN cùng `outsourcingOrderItemId`) vượt SL gửi của dòng OS-OUT đó
  // — khác `E154` (vượt SL đặt của dòng PO).
  E172 = 'outsourcing_receipt.error.quantity_exceeded',
  // Huỷ OS-IN đã `POSTED` khi đã sinh `qc_requests` (`kind = INCOMING`) trỏ vào — cùng lý
  // do `supplier_returns` chưa có `cancel`.
  E173 = 'outsourcing_receipt.error.locked_by_iqc',
  E174 = 'oqc_inspection.error.not_found',
  // Tạo OQC cho một Job chưa/không còn `IN_PROGRESS` — khác `E167` (ném từ `outsourcing_orders`,
  // cùng khái niệm khác domain).
  E175 = 'oqc_inspection.error.job_not_in_progress',
  // Σ SL đã xin QC của cả node BOM (mọi công đoạn as-used, trừ dòng SCRAP), cộng lô mới, vượt
  // `production_job_bom_items.plannedQuantity` (đã đóng băng lúc duyệt LSX) — không phải
  // `production_jobs.quantity`, dù cùng giá trị ở node Cấp 0.
  E176 = 'oqc_inspection.error.lot_size_exceeded',
  // Lưu lại kết quả (`confirm`) khi đã `COMPLETED` — khoá cứng, khác IQC (chỉ `WAITING_RETURN`
  // khoá).
  E177 = 'oqc_inspection.error.already_completed',
  // Xoá phiếu OQC khi không còn `NOT_INSPECTED`.
  E178 = 'oqc_inspection.error.not_deletable',
  E179 = 'inventory_receipt.error.production_job_required',
  // E180 (inventory_receipt.error.oqc_pass_quantity_exceeded) dự phòng — OQC đổi từ gắn theo Job
  // sang gắn theo công đoạn (`docs/decisions/oqc-per-operation.md`), SL OQC giờ ở đơn vị part, so
  // trực tiếp với SL nhập kho (đơn vị FG) là sai đơn vị. Thay bằng `E196`/`E197`.
  E180 = 'inventory_receipt.error.oqc_pass_quantity_exceeded',
  // Nghỉ hưu — cùng lý do `E097`: `code` không còn cho client tự truyền trên `create`.
  E181 = 'oqc_inspection.error.code_exists',
  E182 = 'outsourcing_order.error.items_required',
  // Hai dòng trong cùng payload OS-OUT trỏ cùng một `productionJobOperationId` — mỗi công đoạn chỉ
  // được xuất hiện một lần trên một phiếu.
  E183 = 'outsourcing_order.error.duplicate_operation',
  // E184 (outsourcing_order.error.planned_quantity_exceeded) dự phòng — trước ném khi Σ SL gửi
  // (cộng dồn theo `productionJobOperationId`) vượt `plannedQuantity` của node BOM; cùng lý do bỏ
  // như E166 — không còn validate phía server.
  E184 = 'outsourcing_order.error.planned_quantity_exceeded',
  E185 = 'outsourcing_receipt.error.items_required',
  // Hai dòng trong cùng payload OS-IN trỏ cùng một `outsourcingOrderItemId`.
  E186 = 'outsourcing_receipt.error.duplicate_order_item',
  // Dòng trỏ tới một `outsourcingOrderItemId` mà NCC của OS-OUT chứa nó khác `supplierId` của
  // header OS-IN — bất biến "1 phiếu OS-IN = 1 NCC".
  E187 = 'outsourcing_receipt.error.supplier_mismatch',
  // E188 (outbound_order.error.items_required) dự phòng — trước ném khi `items[]` rỗng;
  // `createOutboundOrder` không còn resolve/validate dòng phía server (lý do ở comment hàm đó).
  E188 = 'outbound_order.error.items_required',
  // E189 (outbound_order.error.duplicate_order_item) dự phòng — trước ném khi 2 dòng cùng payload
  // trỏ cùng một `orderItemId`; giao một dòng PO nhiều lần là hợp lệ theo thiết kế
  // (`outbound_order_items`, doc-comment của bảng).
  E189 = 'outbound_order.error.duplicate_order_item',
  // E190 (outbound_order.error.order_item_not_found) dự phòng — cùng lý do bỏ như E188.
  E190 = 'outbound_order.error.order_item_not_found',
  // E191 (outbound_order.error.order_item_not_deliverable) dự phòng — cùng lý do bỏ như E188;
  // trước ném khi dòng PO đã bị huỷ (`order_items.status = CANCELLED`), đơn đã xoá mềm, hoặc đơn
  // chưa/không còn ở trạng thái được phép giao (`AWAITING_PRODUCTION`/`IN_PROGRESS`).
  E191 = 'outbound_order.error.order_item_not_deliverable',
  // E192 (outbound_order.error.client_mismatch) dự phòng — cùng lý do bỏ như E188; trước ném khi
  // `order_items` trỏ tới một đơn có `clientId` khác `clientId` của header DO.
  E192 = 'outbound_order.error.client_mismatch',
  // E193 (outbound_order.error.quantity_exceeds_ordered) dự phòng — cùng lý do bỏ như E188; trước
  // ném khi SL dòng vượt SL đặt của `order_items` đó (`order_items.quantity`).
  E193 = 'outbound_order.error.quantity_exceeds_ordered',
  // `POST /outbound-orders/:id/send` (chốt thật) và `.../approve` (kiểm lại) khi Σ SL cùng vật tư
  // của phiếu vượt `Có thể giao = Tồn kho FG − Đã giữ của DO khác PENDING_APPROVAL/PENDING_DELIVERY`
  // — cùng khuôn `E231` (phiếu lãnh vật tư). Xem `docs/domains/inventory.md`.
  E194 = 'outbound_order.error.quantity_exceeds_deliverable',
  E195 = 'outbound_order.error.not_found',
  // Nhập kho thành phẩm (`receiptType = PRODUCTION`) khi Job chưa có phiếu OQC nào (dòng
  // `disposition = SCRAP` không tính), hoặc còn phiếu OQC nào chưa `COMPLETED`
  // (`NOT_INSPECTED`/`PENDING`/`REWORK`) — thay `E180` cũ (so SL, giờ đổi sang so trạng thái vì đơn
  // vị OQC không còn khớp đơn vị FG).
  E196 = 'inventory_receipt.error.oqc_not_completed',
  // SL các dòng phiếu nhập `PRODUCTION` (cộng dồn mọi phiếu khác đã `confirm` cùng Job, trừ chính
  // phiếu này) vượt `production_jobs.quantity` (SL kế hoạch) — khác `E154` (vượt SL đặt dòng PO) và
  // `E172` (vượt SL gửi OS-OUT).
  E197 = 'inventory_receipt.error.job_planned_quantity_exceeded',
  // Công đoạn Cấp 0 đã có dòng OQC khác (chưa `SCRAP`) — lô kiểm luôn lấy trọn `completedQuantity`
  // (không phải một phần), nên xin QC lần hai cho cùng công đoạn chắc chắn là trùng.
  E198 = 'oqc_inspection.error.operation_completed_quantity_insufficient',
  // Node BOM chứa công đoạn đã mất `itemId` (item gốc bị xoá, `set null`) — không có gì để
  // snapshot vào `qc_requests.itemId` (NOT NULL) khi tạo OQC.
  E199 = 'oqc_inspection.error.item_not_resolvable',
  // `GET /oqc/aql-plan` không tra được plan (lot size/inspection level/AQL rơi vào ô bảng chuẩn
  // chưa điền — xem `iqc-aql.constant.ts`); hoặc `confirmOqc` không có cả `result` gửi lên lẫn
  // `resultAuto` tự suy để dùng làm mặc định.
  E200 = 'oqc_inspection.error.aql_plan_not_found',
  // Nghỉ hưu — `confirmOqc` không còn bắt buộc `resultNote` khi `result` lệch `resultAuto`; AQL chỉ
  // là gợi ý hiển thị, QC toàn quyền quyết định `result`. Giữ comment, không tái sử dụng số.
  E201 = 'oqc_inspection.error.result_override_reason_required',
  // Nghỉ hưu — `confirmOqc` không còn chặn `result = PASS` kèm `disposition`; server tự bỏ qua
  // `disposition` khi PASS trước khi ghi, DB CHECK (`chk_qc_requests_disposition_requires_fail`)
  // vẫn là chốt chặn cuối. Giữ comment, không tái sử dụng số.
  E202 = 'oqc_inspection.error.disposition_not_allowed_for_pass',
  // `postInventoryIssue` (`issueType = PRODUCTION`) khi còn ≥1 phiếu IQC chưa `COMPLETED` của cùng
  // `itemId` — vật tư chưa qua IQC (hoặc IQC còn FAIL chưa xử lý) không được xuất cho sản xuất
  // (`docs/decisions/qc-gates-on-stock-moves.md`).
  E203 = 'inventory_issue.error.iqc_pending',
  // `DELETE /iqc/:iqcId` khi đã từng `confirm` (`confirmedAt` khác null) — chỉ xoá được phiếu chưa
  // ai đụng vào, khuôn `E178` (OQC) nhưng mint riêng vì hai domain khác nhau.
  E206 = 'iqc_inspection.error.not_deletable',
  // Nghỉ hưu — từng dùng cho `POST /outbound-orders/:id/confirm` (`DRAFT → PENDING_DELIVERY` thẳng,
  // không qua duyệt). Route đã bỏ khi thêm luồng gửi duyệt/duyệt (`E239`/`E240`), giữ comment để số
  // này không bị cấp lại cho lỗi khác.
  E204 = 'outbound_order.error.not_confirmable',
  // Còn ≥1 Job (suy từ `outbound_order_items.productionJobId`, bỏ qua dòng `null`) chưa qua hết
  // QC (`getJobQcCoverage`, tái dùng `E196`, cùng loại trừ dòng `disposition = SCRAP`) — hàng
  // lỗi/chưa kiểm/đã loại bỏ chưa được giao cho khách.
  E205 = 'outbound_order.error.oqc_not_completed',
  // `PATCH /users/:userId` gửi `credential` cho user chưa có tài khoản đăng nhập nhưng thiếu
  // `password` — tạo credential mới thì mật khẩu là bắt buộc (sửa credential sẵn có thì không).
  E207 = 'credential.error.password_required',
  // `POST /orders/:orderId/payments` với `amount = 0` — DB CHECK
  // `chk_order_payments_amount_nonzero` là chốt chặn thật, mã này chỉ để trả lỗi rõ ràng.
  E208 = 'order_payment.error.amount_zero',
  // `POST /inventory-receipts/:receiptId/confirm` (`receiptType = PRODUCTION`) khi Job có node
  // Cấp 0 (`copyFinalAssemblyRouting`) mà chưa có phiếu OQC nào `COMPLETED` (trừ `disposition =
  // SCRAP`) gắn với công đoạn của node đó — tách riêng khỏi `E196` (còn phiếu OQC dở dang) vì đây là
  // lý do khác: chưa từng QC thành phẩm. `docs/decisions/oqc-per-operation.md` mục "Đừng hoàn lại".
  E209 = 'inventory_receipt.error.final_oqc_missing',
  // `POST /production-execution/operations/:jobOperationId/reports` khi công đoạn thuộc node Cấp 0
  // (`itemType = 'FG'`, bước Lắp ráp) mà còn công đoạn của node khác trong cùng Job chưa
  // `completedDate` — "A, B, C đều ✔ mới mở Assembly".
  E210 = 'production_job_operation.error.assembly_not_ready',
  // Nghỉ hưu — từ khi tạo OQC chuyển sang cấp Job (`POST /production-jobs/:jobId/qc`), công đoạn
  // Cấp 0 được chọn đã tự lọc `type ≠ OUTSOURCE` ngay trong câu `SELECT` của
  // `OqcService.createOqcForJob` (rơi vào `E213` nếu không còn công đoạn hợp lệ nào), không còn
  // đường nào để mã này tự nó được ném ra nữa. Giữ số, không tái sử dụng.
  E211 = 'oqc_inspection.error.outsourced_operation',
  // Nghỉ hưu — chưa từng phát hành: điều kiện của nó ("Job có công đoạn OUTSOURCE mà chưa có IQC
  // nào từ OS-IN") hoá ra là tập con của `E196` sau khi `getJobQcCoverage` hợp nhất IQC/OQC theo
  // công đoạn (`docs/decisions/qc-data-model.md`) — công đoạn OS-IN chưa `requiresIqc` đóng góp
  // `(0, 0)` vào tổng, không tự nó chặn được gì; `E196` đã bắt đúng ca "đã yêu cầu IQC mà chưa
  // xong". Giữ số, không tái sử dụng.
  E212 = 'inventory_receipt.error.outsourcing_iqc_missing',
  // `POST /production-jobs/:jobId/qc` khi Job không khai báo routing Cấp 0 (không có node BOM
  // `itemType = 'FG'`, xem `docs/decisions/oqc-per-operation.md` mục "QC cho Cấp 0") — route này
  // chỉ áp dụng cho Job có bước lắp ráp/thành phẩm riêng.
  E213 = 'production_job.error.no_final_assembly',
  // `POST /production-jobs/:jobId/qc` khi còn công đoạn nào của Job chưa `completedDate` (kể cả
  // chính công đoạn Cấp 0) — phải xong toàn bộ mới được yêu cầu QC thành phẩm cho cả Job.
  E214 = 'production_job.error.operations_not_completed',
  // Nghỉ hưu — `confirmOqc` không còn bắt buộc `dispositionNote` khi `disposition ∈ {ACCEPT, SCRAP}`;
  // QC toàn quyền quyết định phương án xử lý. Giữ comment, không tái sử dụng số.
  E215 = 'oqc_inspection.error.disposition_reason_required',
  E216 = 'qc_aql_plan.error.not_found',
  E217 = 'qc_aql_plan.error.code_exists',
  // Hai rule của cùng plan có dải `[lotSizeMin, lotSizeMax]` giao nhau — DB không chặn được overlap
  // (cần `EXCLUDE USING gist`, drizzle-orm chưa có builder), service là chốt chặn duy nhất.
  E218 = 'qc_aql_rule.error.lot_size_overlap',
  // `GET /iqc/aql-plan` không tra được plan (lot size/inspection level/AQL rơi vào ô bảng chưa có
  // rule) — mint riêng, không dùng `E200` vì mã đó namespace `oqc_inspection.error.*`.
  E219 = 'iqc_inspection.error.aql_plan_not_found',
  E220 = 'file.error.linked_to_qc_evidence',
  E221 = 'qc_aql_plan.error.level_aql_exists',
  E222 = 'qc_aql_rule.error.rejection_not_greater_than_acceptance',
  E223 = 'inventory_requisition.error.not_found',
  E224 = 'inventory_requisition.error.not_editable',
  E225 = 'inventory_requisition.error.invalid_approval_state',
  E226 = 'inventory_requisition.error.not_issuable',
  E227 = 'inventory_requisition.error.no_items',
  E228 = 'inventory_requisition_item.error.duplicate_item',
  E229 = 'inventory_requisition_item.error.item_not_raw_material',
  E230 = 'inventory_requisition_item.error.not_in_job_bom',
  E231 = 'inventory_requisition_item.error.quantity_exceeds_issuable',
  E232 = 'inventory_requisition_item.error.quantity_exceeds_bom_remaining',
  E233 = 'inventory_requisition.error.production_job_required',
  // `POST`/`PATCH /inventory-issues` với `issueType = PRODUCTION` — đường lãnh vật tư cho sản xuất
  // chỉ còn một nguồn: `POST /inventory-requisitions/:id/issue`.
  E234 = 'inventory_issue.error.production_requires_requisition',
  // `POST /inventory-issues/:id/cancel` trên một phiếu do `inventory_requisitions.issue` sinh ra.
  E235 = 'inventory_issue.error.generated_from_requisition',
  // `PATCH /orders/:orderId` với `status: CANCELLED` trên đơn có LSX (`production_orders`) đã
  // `APPROVED` — duyệt LSX là chốt kế hoạch một chiều (cùng lý do `E080`), huỷ lúc này sẽ để LSX/Job
  // mồ côi hoặc đụng ràng buộc OQC restrict nếu cascade-xoá. LSX còn `PENDING` không ném lỗi này —
  // xem `OrdersService.ensureProductionOrderNotApproved`.
  E236 = 'order.error.has_approved_production_order',
  // `POST /outbound-orders/:id/deliver` khi phiếu không ở `PENDING_DELIVERY`.
  E237 = 'outbound_order.error.not_deliverable',
  // E238 (outbound_order.error.fg_warehouse_ambiguous) stays reserved — `deliver` không còn cần
  // resolve kho, hệ thống chỉ 1 kho vật lý (`docs/decisions/single-warehouse.md`).
  // `POST /outbound-orders/:id/send` khi phiếu không ở `DRAFT`/`REJECTED`.
  E239 = 'outbound_order.error.not_sendable',
  // `POST /outbound-orders/:id/approve` hoặc `.../reject` khi phiếu không ở `PENDING_APPROVAL`.
  E240 = 'outbound_order.error.invalid_approval_state',
  E241 = 'unit.error.code_exists',
  E242 = 'unit.error.in_use',
  E243 = 'unit.error.scopes_required',
  // Gỡ một scope khỏi unit trong khi còn `items` loại tương ứng dùng nó — deliberately distinct
  // from E043 (unit sai scope ngay lúc gán cho item), đây là chặn trước khi unit *trở thành* sai
  // scope cho những item đang gán nó.
  E244 = 'unit.error.scope_in_use',
  // `POST /items/:itemId/bom/items` thêm cùng `itemId` hai lần dưới cùng một node cha.
  E245 = 'bom_item.error.duplicate',
  // `DELETE /clients/:id` khi còn `orders`/`outbound_orders` trỏ tới.
  E246 = 'client.error.in_use',
  // `DELETE /suppliers/:id` khi còn chứng từ mua hàng/gia công trỏ tới.
  E247 = 'supplier.error.in_use',
  // `DELETE /operations/:id` khi còn `routing_operations`/`bom_operations` trỏ tới.
  E248 = 'operation.error.in_use',
  // `POST /purchase-orders` khi cùng một `purchaseRequestItemId` xuất hiện ở ≥ 2 dòng trong payload.
  E249 = 'purchase_order.error.duplicate_request_item',
  // Nghỉ hưu 2026-09-03 — bỏ hẳn bước duyệt công đoạn riêng (`POST .../approve-operations` đã
  // xoá); Job vào `IN_PROGRESS` (qua `POST .../start`) là báo tiến độ từng công đoạn được ngay.
  // Giữ comment, không tái sử dụng số.
  E250 = 'production_job.error.operations_not_approved',
  // Nghỉ hưu 2026-09-03 — cùng lý do E250 ở trên (route `approve-operations` đã xoá). Giữ
  // comment, không tái sử dụng số.
  E251 = 'production_job.error.operations_already_approved',
  // Nghỉ hưu 2026-08-27 — thay bằng `E256`. Trần "đạt + NG ≤ plannedQuantity" làm công đoạn kẹt
  // vĩnh viễn khi NG chiếm hết chỗ trước khi SL đạt kịp chạm đủ kế hoạch (không còn cách hợp lệ nào
  // báo thêm để đạt `completedDate`, kéo theo cả Job kẹt qua gate `E210`, BUG-035 phát hiện
  // 2026-08-27). Giữ comment, không tái sử dụng số.
  E252 = 'production_job_operation.error.completed_plus_rejected_exceeds_planned',
  // `POST`/`PATCH inventory-receipts` khi cả `supplierId` lẫn `clientId` cùng có giá trị — hai
  // nguồn loại trừ lẫn nhau (BUG-038).
  E253 = 'inventory_receipt.error.supplier_client_exclusive',
  // `POST .../confirm` (IQC) chọn `disposition = SORT`/`RETURN` cho dòng IQC sinh từ phiếu nhập
  // RETURN gắn khách hàng (không có `supplierId`) — không có phiếu trả-lại-khách để tự sinh, QC
  // chỉ được chọn `CONCESSION` (BUG-065).
  E254 = 'iqc_inspection.error.disposition_requires_supplier',
  // `DELETE /items/:itemId` khi item còn gắn `order_items`, `production_order_items`, hoặc
  // `production_jobs` (BUG-039).
  E255 = 'item.error.in_use',
  // Riêng `completedQuantity` (SL đạt) vượt `plannedQuantity` của node BOM cha — thay `E252` (nghỉ
  // hưu). `rejectedQuantity` (SL NG) không còn bị giới hạn theo `plannedQuantity`: cho phép báo bù
  // thêm khi có hàng lỗi, tới khi SL đạt chạm đủ kế hoạch (BUG-035, 2026-08-27).
  E256 = 'production_job_operation.error.completed_quantity_exceeds_planned',
  // `POST /outbound-orders/:id/cancel` khi DO không còn DRAFT/PENDING_APPROVAL/PENDING_DELIVERY
  // (BUG-090).
  E257 = 'outbound_order.error.not_cancellable',
  // `DELETE /outbound-orders/:id` khi DO không còn DRAFT (BUG-090).
  E258 = 'outbound_order.error.not_deletable',
  // `PATCH /outbound-orders/:id` khi DO không còn DRAFT (BUG-090).
  E259 = 'outbound_order.error.not_editable',
  // `POST .../reports` trên công đoạn `OUTSOURCE` — completedQuantity/completedDate chỉ do OS-IN
  // ghi (`recomputeOutsourcedOperationProgress`), không cho nhập tay
  // (`docs/decisions/outsourced-operation-progress-writeback.md`).
  E260 = 'production_job_operation.error.outsource_not_editable',
  // Trùng `itemId` trong cùng payload lập/sửa phiếu điều chỉnh tồn — cùng khuôn `E228` (phiếu
  // lãnh), mint riêng vì khác resource.
  E261 = 'inventory_adjustment_item.error.duplicate_item',
  // `PATCH /items/:itemId/units/:unitId`/`DELETE` khi dòng `item_units` không tồn tại đúng item đó
  // — khác `E011` (unit gốc không tồn tại trong danh mục `units`).
  E262 = 'item_unit.error.not_found',
  // `POST /items/:itemId/units` khi `(itemId, unitId)` đã có dòng — mỗi cặp chỉ 1 hệ số quy đổi.
  // Xoá một dòng `item_units` không cần mã lỗi "in_use" riêng — `unitId` của dòng phiếu kho FK
  // thẳng `units`, không FK `item_units` (`docs/decisions/unit-conversion.md`).
  E263 = 'item_unit.error.duplicate_unit',
  // `DELETE /orders/:orderId` khi status khác `DRAFT` — cùng khuôn `E258` (outbound_order), mint
  // riêng vì khác resource.
  E264 = 'order.error.not_deletable',
  V003 = 'common.error.too_many_requests',
  // `GlobalExceptionFilter` bắt chuỗi "No values to set" của drizzle-orm — mọi `PATCH` khi
  // `ValidationPipe` whitelist đã loại sạch field lạ, còn lại payload rỗng cho `.set()`. Trước đây
  // lọt xuống lỗi 500 kèm stack trace (`BUG-076`).
  V004 = 'common.error.empty_update_payload',
}
