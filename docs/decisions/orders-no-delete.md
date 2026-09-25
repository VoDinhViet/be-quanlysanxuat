# Không có route xoá đơn hàng

**Trạng thái:** đảo một phần (2026-09-04) — xem mục cuối

## Bối cảnh

`DELETE /orders/:orderId` (xoá mềm, set `deletedAt`) từng tồn tại, khoá bằng cùng điều kiện với
`PATCH` (`OrdersService.ensureOrderEditable`). Đơn hàng là chứng từ thương mại — nguồn sự thật duy
nhất cho kế hoạch sản xuất, tồn kho giữ chỗ (`reserved`), và số liệu dashboard
(`GET /orders/stats`). Xoá một đơn — kể cả xoá mềm — làm mất dấu vết một chứng từ đã tồn tại, khác
hẳn ý nghĩa "huỷ" mà nghiệp vụ thực sự cần.

## Quyết định

Bỏ hẳn route xoá đơn hàng qua API.

- `OrdersController.deleteOrder`, `OrdersService.deleteOrder` đã xoá khỏi code.
- Permission `orders:delete` đã xoá khỏi `PERMISSION_CODES` — xác nhận trước khi xoá: không role
  nào (kể cả trên DB thật) đang giữ permission này.
- Huỷ một đơn dùng `PATCH /orders/:orderId` với `status: CANCELLED` (đã có sẵn, không cần route
  mới) — đơn vẫn còn trong hệ thống, tra cứu được, nhưng không tính vào các luồng đang hoạt động
  (`docs/domains/orders.md`, mục Common mistakes).
- Cột `orders.deletedAt` **vẫn còn trong schema** — không phải migration, chỉ là không còn đường
  ghi vào nó qua API. `isNull(orders.deletedAt)` ở các query đọc giữ nguyên, không cần đổi.

## Hệ quả

- Một đơn ở trạng thái kết thúc (`COMPLETED`/`CANCELLED`) hoặc đang chờ duyệt
  (`PENDING_CONFIRMATION`) giờ **bất biến theo cả hai nghĩa** — không sửa được (`E065`/`E090`), và
  không có cách nào khác (xoá) để loại bỏ nó khỏi hệ thống.
- Nếu sau này thật sự cần xoá một đơn (ví dụ đơn `DRAFT` tạo nhầm), đó là thao tác tay trên DB, không
  phải nhu cầu API — chưa có yêu cầu nghiệp vụ nào đủ mạnh để mở lại route này.

## Cập nhật 2026-09-04 — mở lại, hẹp hơn

Đúng tình huống mục Hệ quả ở trên từng nói — đơn `DRAFT` tạo nhầm — nay đã thành yêu cầu nghiệp vụ
thật. `DELETE /orders/:orderId` mở lại, nhưng **hẹp hơn bản cũ**: chỉ cho xoá khi `status === DRAFT`
(bản cũ khoá bằng `ensureOrderEditable`, cho cả các trạng thái giữa chừng khác như
`AWAITING_PRODUCTION`/`IN_PROGRESS`). Vẫn xoá **mềm** (`deletedAt`), không xoá cứng, không đụng
`order_items`/`order_files`/`order_payments`/`production_orders` — đúng tinh thần "không mất dấu
chứng từ" của quyết định gốc, chỉ ẩn khỏi các query đang lọc `isNull(deletedAt)`.

Chỉ check trạng thái `DRAFT`, không thêm guard nào khác — quyết định có chủ đích: một đơn `DRAFT`
về lý thuyết có thể quay ngược từ trạng thái sau (`PATCH { status: 'DRAFT' }` không bị chặn ở
`AWAITING_PRODUCTION`/`IN_PROGRESS`) nên không chắc chắn tuyệt đối "chưa có gì phía sau", nhưng xoá
mềm không đụng bảng con nào nên không có rủi ro vỡ ràng buộc `restrict`; rủi ro còn lại (mất dấu vết
nghiệp vụ nếu đơn đó thật ra còn LSX phía sau) được chấp nhận cho phạm vi hẹp này.

Permission `orders:delete` cấp lại — `PERMISSION_CODES`, seed vai trò `SALES`/`DIRECTOR`.

`E058 = 'order.error.code_exists'` (đã nghỉ hưu, không liên quan việc này) **vẫn không được tái
dùng** — mã lỗi mới cho việc này là `E264 = 'order.error.not_deletable'`.

## Cập nhật 2026-09-25 — thêm `REJECTED`

Đơn bị từ chối (`REJECTED`) không còn luồng xử lý tiếp theo nếu người bán quyết định bỏ hẳn (góp ý
PH-10): sửa rồi gửi duyệt lại đã có, nhưng không xoá được. `DELETE /orders/:orderId` nay cho xoá đơn
**chưa được duyệt** — `DRAFT` hoặc `REJECTED` (`ensureOrderDeletable` trong `orders.service.ts`).
Đơn `REJECTED` chưa từng được duyệt nên chưa sinh hồ sơ LSX (LSX sinh cùng transaction với duyệt);
xoá vẫn là xoá mềm, các cột `rejectedBy`/`rejectedAt`/lý do nằm trong chính dòng đơn nên không mất
thêm dấu vết nào ngoài việc ẩn đơn khỏi query. Mã lỗi `E264` giữ nguyên cho mọi trạng thái còn lại.
