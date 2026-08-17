# Bỏ trạng thái nháp ở OS-OUT/OS-IN

**Trạng thái:** còn hiệu lực

## Bối cảnh

`outsourcing-orders` (OS-OUT) và `outsourcing-receipts` (OS-IN) khi mới merge (`docs/workflows/
outsourcing-round-trip.md`) có vòng đời `DRAFT → POSTED → CANCELLED`, cùng khuôn `inventory_issues`:
`POST /` chỉ tạo `DRAFT`, `PATCH`/`DELETE :id` sửa/xoá được lúc còn `DRAFT`, `POST :id/post` mới
thật sự trừ/cộng tồn kho và validate lại lần cuối. Thiết kế này đảo ngược gần như ngay sau khi
merge — nghiệp vụ thực tế không cần bước nháp cho hai chứng từ này: lập phiếu gửi/nhận gia công
ngoài là hành động dứt khoát, không có nhu cầu soạn-rồi-sửa trước khi gửi đi/xác nhận đã nhận.

## Quyết định

Bỏ hẳn bước nháp — `create` là gửi/nhận luôn (`POSTED` ngay), cho cả hai module.

- **Xoá hẳn** route `PATCH`/`DELETE :id` và `POST :id/post` của cả `outsourcing-orders` lẫn
  `outsourcing-receipts`. Logic của `post` cũ (validate lại lần hai trên dữ liệu vừa insert, gọi
  `InventoryPostingService.postDocument`, và với OS-IN là sinh IQC nếu `requiresIqc`) gộp thẳng vào
  transaction của `create`.
- `createOutsourcingOrder`/`createOutsourcingReceipt` giờ: validate mềm (ngoài transaction) →
  `INSERT` header thẳng `status: POSTED` (`postedBy`/`postedAt` set ngay, không còn `UPDATE` riêng
  sau này) + `INSERT` mọi dòng, cả hai `.returning()` toàn bộ cột → validate lại lần hai trên dữ
  liệu vừa insert (chốt chặn thật) → `postDocument`.
- **`excludeOrderId`/`excludeReceiptId` ở lượt validate thứ hai (`ensurePersistedItemsWithinPlanned`/
  `ensurePersistedItemsWithinOrdered`) bắt buộc phải tiếp tục truyền = chính phiếu vừa `.returning()`
  được** — đây không phải tham số thừa. Header được `INSERT` với `status: POSTED` ngay trong cùng
  transaction, nên các hàm tính SL đã gửi/nhận (`getSentQuantityByJobOperationIds`/
  `getReceivedQuantityByOrderItemIds`, lọc `statuses: [POSTED]`) sẽ nhìn thấy chính dòng của phiếu
  đang tạo nếu không loại trừ — cộng dồn nhầm chính nó, báo `E184`/`E172` sai cho một phiếu đúng hết
  định mức.
- `resolveAndValidateItems` (cả hai service) bỏ tham số `excludeOrderId`/`excludeReceiptId` (chỉ
  `update` từng truyền, mà `update` đã xoá), `statuses` đổi từ `[DRAFT, POSTED]` còn `[POSTED]`.
- **Thêm `outsourcing:create` cho role `WAREHOUSE`** (`credentials.seed.ts`) — quyền
  `outsourcing:create/update/delete` dùng chung cho cả hai module. `WAREHOUSE` (bên thực tế nhận
  hàng OS-IN) trước đây chỉ có `update`/`delete` (dùng cho `post`/`cancel`/xoá nháp); gộp `post` vào
  `create` thì phải có `create` mới tự thao tác được. Đánh đổi chấp nhận: `WAREHOUSE` giờ cũng tạo
  được OS-OUT (quyền dùng chung, không tách theo module).
  - **Seed không tự đồng bộ vào DB đã tồn tại role** — `ensureRole()` chỉ `findFirst` rồi bỏ qua nếu
    role đã có. Áp dụng thật cho DB hiện tại cần một `UPDATE roles SET permissions = permissions ||
    '["outsourcing:create"]'::jsonb WHERE code = 'WAREHOUSE'` chạy riêng, có phê duyệt.
- **Giữ nguyên, không đổi**: `OutsourcingOrderProgress.DRAFT`/`OutsourcingReceiptProgress.DRAFT` (enum
  member + nhánh xử lý) — không phải nhánh chết, dữ liệu cũ trước khi đổi vẫn có thể còn ở `DRAFT`
  thật; cột `status` vẫn default `DRAFT` (đổi default cần migration, không ích gì vì service luôn
  set tường minh); `cancelOutsourcingOrder`/`cancelOutsourcingReceipt` giữ nguyên 100%, kể cả điều
  kiện `if (row.status === POSTED)` tường minh (không rút gọn `!== CANCELLED`) — dữ liệu `DRAFT` cũ
  vẫn có thể đi qua `cancel`.

## Hệ quả

- `POST /outsourcing-orders`/`POST /outsourcing-receipts` giờ có thể trả `E106` (thiếu tồn kho) —
  trước đây `E106` chỉ xảy ra ở bước `post` riêng, không bao giờ ở `create`.
- `E098` (sai trạng thái nguồn) hết còn xảy ra ở `create`/`update`/`delete` của hai module này — chỉ
  còn ở `cancel` gọi trên phiếu đã `CANCELLED`. Comment của `E098` (dùng chung với `inventory_receipts`/
  `inventory_issues`) không đổi vì vẫn đúng cho các module đó.
- `E171` (OS-OUT chưa `POSTED` khi tạo dòng OS-IN) chỉ còn bắt được trường hợp OS-OUT đã `CANCELLED`
  — nhánh "còn `DRAFT`" không còn khả thi vì một OS-OUT tồn tại thì luôn đã `POSTED` hoặc `CANCELLED`.
- Một phiếu tạo lỗi (`E184`/`E106`/`E172`...) giờ mất trắng cả payload — không còn `DRAFT` để quay
  lại sửa, phải nhập lại từ đầu.
- **Đừng hoàn lại** `PATCH`/`DELETE`/`post` riêng mà không nghĩ lại toàn bộ luồng — nếu sau này thật
  sự cần sửa được sau khi tạo, thiết kế đúng là một route sửa mới với gate riêng (ví dụ "sửa được nếu
  chưa có OS-IN nào nhận" — tái dùng `hasActiveReceiptsForOrder` đã có), không phải khôi phục lại
  khái niệm `DRAFT`.
- **Đừng bỏ** `excludeOrderId: order.id`/`excludeReceiptId: receipt.id` khỏi lệnh gọi
  `ensurePersistedItemsWithinPlanned`/`ensurePersistedItemsWithinOrdered` trong `create` — xem cảnh
  báo ở mục Quyết định, đây là bẫy dễ tưởng thừa rồi xoá nhầm.
