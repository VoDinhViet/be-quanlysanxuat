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
  E006 = 'product.error.locked',
  E007 = 'product.error.not_found',
  E008 = 'product.error.code_exists',
  E009 = 'client.error.not_found',
  E010 = 'product_group.error.not_found',
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
  E035 = 'material.error.not_found',
  E036 = 'material.error.code_exists',
  E037 = 'material_group.error.not_found',
  // E038 (material_group.code_exists) and E039 (material_group.in_use) stay reserved with their
  // original meanings — the material-group CRUD that would raise them isn't built yet.
  E040 = 'material.error.client_required',
  // Blocks `DELETE /materials/:materialId` when the material is still referenced by at least one
  // `bom_items` node — the FK is `onDelete: 'restrict'`, so this turns what would otherwise be a
  // raw 500 into a clean 409.
  E041 = 'material.has_transactions',
  E042 = 'file.error.not_found',
  // The unit exists but isn't assignable to this kind of entity (e.g. `Mét` on a product) —
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
  // read-only catalogue (list only, no create/update/delete). E046 stays live: `RoutingService`
  // independently throws it when a routing step references a missing operation.
  E047 = 'operation.error.code_exists',
  // E048/E049 (product_revision not_found/number_exists) stay reserved — the product-revisions
  // module was removed in favor of whole-product copy/clone (`POST /products/:id/copy`); no
  // current throw site uses them.
  E050 = 'bom_item.error.not_found',
  E051 = 'bom_item.error.parent_not_found',
  E052 = 'bom_item.error.parent_is_material',
  E053 = 'bom_item.error.product_not_wip',
  E054 = 'bom_item.error.cycle_detected',
  E055 = 'bom_item.error.quantity_not_integer',
  E056 = 'routing_step.error.not_found',
  E057 = 'order.error.not_found',
  E058 = 'order.error.code_exists',
  // Client/staff/product refs on an order. Retired when the module was pared down to a
  // header-only table on 2026-07-27, restored with their original meanings the same day when the
  // module was re-expanded — so no client ever saw these codes point at anything else.
  E059 = 'order.error.client_not_found',
  E060 = 'order.error.staff_not_found',
  E061 = 'order.error.product_not_found',
  // `bomItemId` on a routing route doesn't reference a `bom_items` row within the URL's own
  // product BOM — either it doesn't exist at all, or it belongs to a different product's tree.
  E062 = 'routing_step.error.bom_item_not_found',
  // The `bomItemId` node exists and belongs to this product's BOM, but is a MATERIAL leaf —
  // vật tư nodes never carry their own routing.
  E063 = 'routing_step.error.material_node',
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
  E067 = 'stock_receipt.error.not_found',
  E068 = 'stock_receipt.error.code_exists',
  // `productId` on a stock receipt line doesn't reference any `products` row.
  E069 = 'stock_receipt.error.product_not_found',
  // The `productId` exists but isn't a FINISHED_GOOD — only finished goods are tracked here.
  E070 = 'stock_receipt.error.product_not_finished_good',
  // Writing (create or update) this receipt would drive some product's on-hand quantity below
  // zero. On update, evaluated against the ledger with this receipt's own current lines excluded.
  E071 = 'stock_receipt.error.insufficient_stock',
  // `orderItemId` on a line is invalid: sent on a non-OUT receipt, doesn't reference an existing
  // `order_items` row, or references one whose `productId` doesn't match the line's own.
  E072 = 'stock_receipt.error.invalid_order_item',
  // `reason` doesn't belong to `type` (e.g. DELIVERY on an IN receipt) — same rule as the DB
  // CHECK `chk_stock_receipts_reason_type`, pre-validated here for a clean 400 instead of a raw
  // constraint-violation 500.
  E073 = 'stock_receipt.error.reason_type_mismatch',
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
  // `docs/features/production.md`).
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
  // `materialId` trên dòng phiếu nhập/xuất kho vật tư không tồn tại.
  E085 = 'stock_receipt.error.material_not_found',
  // Dòng phiếu gửi sai loại so với `subject` của phiếu cha (`stock_receipts.subject`) — phiếu vật
  // tư mà dòng gửi `productId`, phiếu thành phẩm mà dòng gửi `materialId`, gửi cả hai, hoặc không
  // gửi gì. `chk_stock_receipt_items_target` chỉ đảm bảo "đúng một trong hai", không đảm bảo khớp
  // đúng `subject` — đó là phần việc của mã lỗi này.
  E086 = 'stock_receipt.error.line_target_mismatch',
  // `start`/`report`/`pause`/`resume`/`complete`/`cancel` gọi trên một Job đang không ở trạng thái
  // hợp lệ cho hành động đó (xem bảng chuyển trạng thái ở `docs/features/production.md`).
  E087 = 'production_job.error.invalid_status_transition',
  // `POST /production-jobs/:jobId/report` mà `producedQty + rejectedQty` cộng dồn (đã cộng cả các
  // lần báo trước) vượt quá `quantity` của Job — kiểm ở service để ra 400 sạch thay vì để lộ lỗi
  // constraint `chk_production_jobs_report_qty` 500 thô.
  E088 = 'production_job.error.report_exceeds_quantity',
  // `POST /production-jobs/:jobId/report` mà cả `producedQty` lẫn `rejectedQty` đều không gửi
  // hoặc đều bằng 0 — một lần báo phải ghi nhận được ít nhất một trong hai.
  E089 = 'production_job.error.empty_report',
  E101 = 'class.error.teacher_not_found',
  E102 = 'class.error.invalid_teacher_assignment',
  E103 = 'class.error.forbidden',
  E104 = 'class.error.unique_code_generation_failed',
  E105 = 'class.error.not_found',
  V003 = 'common.error.too_many_requests',
}
