# Bỏ trạng thái nháp ở OS-OUT/OS-IN

**Trạng thái:** còn hiệu lực

## Bối cảnh

OS-OUT/OS-IN khi mới gộp bảng phẳng thành header+dòng có vòng đời `DRAFT → POSTED → CANCELLED`,
cùng khuôn `inventory_issues`: `POST /` chỉ tạo `DRAFT`, `PATCH`/`DELETE :id` sửa/xoá lúc `DRAFT`,
`POST :id/post` mới thật sự trừ/cộng tồn và validate lại lần cuối. Thiết kế này đảo ngược gần như
ngay sau khi merge — lập phiếu gửi/nhận gia công ngoài là hành động dứt khoát, không cần
soạn-rồi-sửa trước khi gửi đi/xác nhận đã nhận.

## Quyết định

Bỏ hẳn bước nháp — `create` là gửi/nhận luôn (`POSTED` ngay), cho cả hai module. Đã xoá hẳn route
`PATCH`/`DELETE :id` và `POST :id/post`. `status` của cả hai bảng tách khỏi
`inventory_document_status` sang 2 enum riêng, chỉ 2 giá trị `POSTED`/`CANCELLED`
(`outsourcing_order_status`/`outsourcing_receipt_status`), default `POSTED` — `DRAFT` không còn là
giá trị hợp lệ ở DB, không chỉ "không route nào ghi".

`createOutsourcingOrder`/`createOutsourcingReceipt`: validate mềm (ngoài transaction) → `INSERT`
header thẳng `status: POSTED` + `INSERT` mọi dòng → `postDocument` (chỉ OS-IN gọi `IqcService` nếu
`requiresIqc`). **Không còn lượt validate thứ hai** trong transaction (`ensurePersistedItemsWithin*`
đã xoá) — lượt đó không khoá gì (không `FOR UPDATE`) nên chưa từng là chốt chặn thật, chỉ đọc lại
đúng phép tính của lượt 1; bỏ nó là quay về chuẩn chung của mọi module viết phiếu khác trong repo
(1 lượt validate trước transaction). Đánh đổi nói thẳng: cửa sổ race hẹp mà lượt 2 từng bắt được nay
rộng ra bằng mọi module khác — nếu cần chặn race thật, cách đúng là khoá hàng (`FOR UPDATE`), không
phải đọc lại lần hai không khoá.

**OS-OUT bỏ sạch resolve/validate phía server** — `OutsourcingOrderItemReqDto` mang đủ
`productionJobId`/`itemId`/`operationId`/`operationCode`/`operationName`, client lấy từ popup
`GET .../outsourceable-operations` rồi gửi thẳng lại; server chỉ còn `validateOrderItems` (shape
thuần: `items[]` không rỗng, không trùng `productionJobOperationId`) rồi `INSERT` thẳng. `E166`
(công đoạn không phải `OUTSOURCE`)/`E167` (Job không `IN_PROGRESS`)/`E168` (BOM node mất
`itemId`)/`E184` (chặn gửi vượt định mức Job) mất throw site, chuyển dự phòng — **`E184` là mất mát
đáng kể nhất**: chốt duy nhất nối OS-OUT vào kế hoạch sản xuất, giờ không còn giới hạn. Đổi lấy: bỏ
2 lượt round-trip DB mỗi lần tạo phiếu, dữ liệu client gửi đã nguyên vẹn từ popup vài giây trước.
Quay lại resolve/validate phía server (nếu cần) là việc thêm mới, không phải khôi phục.

**OS-IN cố tình lệch OS-OUT** — `resolveReceiptItems`/`E171`/`E172`/`E187` giữ nguyên 100%,
`createOutsourcingReceipt` vẫn tự resolve/validate từ `outsourcingOrderItemId`. Đừng "đồng bộ hoá"
hai module lại giống nhau mà không hỏi lại — có chủ đích, không phải một module bị bỏ sót.

`WAREHOUSE` được cấp thêm `outsourcing:create` (quyền dùng chung cho cả OS-OUT/OS-IN) — gộp `post`
vào `create` thì phải có `create` mới tự thao tác được; trước đó chỉ có `update`/`delete`.

`GET /outsourcing-receipts` (list/detail) chỉ trả thông tin header, cùng khuôn OS-OUT — danh sách
dòng ở route riêng `GET /outsourcing-receipts/:id/items`.

## Hệ quả

- `POST /outsourcing-orders`/`POST /outsourcing-receipts` có thể trả `E106` (thiếu tồn kho) — trước
  đây chỉ xảy ra ở bước `post` riêng.
- `E098` (sai trạng thái nguồn) chỉ còn ở `cancel` gọi trên phiếu đã `CANCELLED`.
- `E171` (OS-OUT chưa `POSTED` khi tạo dòng OS-IN) chỉ còn bắt được OS-OUT đã `CANCELLED` — nhánh
  "còn `DRAFT`" không còn khả thi.
- Một phiếu tạo lỗi (`E184`/`E106`/`E172`...) mất trắng payload — không còn `DRAFT` để sửa lại.

## Đừng hoàn lại

- `PATCH`/`DELETE`/`post` riêng mà không nghĩ lại toàn bộ luồng — nếu sau này cần sửa sau khi tạo,
  thiết kế đúng là một route sửa mới với gate riêng (ví dụ "sửa được nếu chưa có OS-IN nào nhận"),
  không phải khôi phục khái niệm `DRAFT`.
- Đọc lại validate 2 lượt không khoá — nếu cần chặn race, khoá hàng (`FOR UPDATE`) thay vì đọc lại.

## Related docs

`docs/decisions/wip-not-stocked.md` (quyết định kế tiếp — bỏ tiếp phần ghi bút toán).
`docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`.
