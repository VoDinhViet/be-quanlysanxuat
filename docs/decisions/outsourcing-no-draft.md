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
- **Giữ nguyên, không đổi** *(lúc quyết định ban đầu — xem cập nhật ngay dưới)*:
  `OutsourcingOrderProgress.DRAFT`/`OutsourcingReceiptProgress.DRAFT` (enum member + nhánh xử lý) —
  không phải nhánh chết, dữ liệu cũ trước khi đổi vẫn có thể còn ở `DRAFT` thật; cột `status` vẫn
  default `DRAFT` (đổi default cần migration, không ích gì vì service luôn set tường minh);
  `cancelOutsourcingOrder`/`cancelOutsourcingReceipt` giữ nguyên 100%, kể cả điều kiện
  `if (row.status === POSTED)` tường minh (không rút gọn `!== CANCELLED`) — dữ liệu `DRAFT` cũ vẫn
  có thể đi qua `cancel`.
- **Cập nhật — đã đảo ngược bullet trên**: kiểm tra DB dev xác nhận không còn hàng nào ở
  `DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT` cho cả `outsourcing_orders` lẫn `outsourcing_receipts` —
  lý do "dữ liệu cũ vẫn có thể còn `DRAFT`" không còn áp dụng. Đã tách `status` của 2 bảng này khỏi
  `inventory_document_status` sang 2 enum riêng, chỉ 2 giá trị `POSTED`/`CANCELLED`
  (`outsourcing_order_status`/`outsourcing_receipt_status`, migration `drizzle/0114_bumpy_blizzard.sql`,
  có remap phòng hờ dữ liệu cũ về `CANCELLED` trước khi cast kiểu cột), default cột đổi `DRAFT` →
  `POSTED`. Kèm theo: xoá nhánh `DRAFT` khỏi `resolveReceiptProgress`
  (`outsourcing-receipts.service.ts`) và khỏi enum `OutsourcingReceiptProgress` — nhánh đó giờ thật
  sự chết vì cột không còn giữ được giá trị `DRAFT` nữa, không chỉ "không route nào ghi" như trước.
  `OutsourcingOrderProgress` (bên OS-OUT) đã bị xoá hoàn toàn ở một thay đổi khác cùng đợt (API chi
  tiết OS-OUT không còn trả `progress`/`items`/`totalQuantity` nữa, chỉ còn thông tin header).
- **Cập nhật — bỏ lượt validate thứ hai của `E184`/`E172`**: `createOutsourcingOrder`/
  `createOutsourcingReceipt` từng validate **hai lượt** trong cùng request — lượt mềm trước khi mở
  transaction, rồi lượt "chốt chặn thật" đọc lại lần nữa trong transaction sau khi đã `INSERT`
  (`ensurePersistedItemsWithinPlanned`/`ensurePersistedItemsWithinOrdered`). Xoá cả hai hàm này —
  chúng không khoá gì (không `FOR UPDATE`, không `isolationLevel`) nên không phải chốt chặn thật, chỉ
  là đọc lại **đúng cùng** phép tính trên **đúng cùng** tập dữ liệu như lượt 1 (nhờ
  `excludeOrderId`/`excludeReceiptId` loại đúng phiếu đang tạo). Không module viết phiếu nào khác
  trong repo dùng khuôn 2-lượt-trong-1-request này (`inventory-issues`/`outbound-orders`/
  `purchase-requests` chỉ 1 lượt trước transaction) — bỏ nó là quay về chuẩn chung, không phải giảm
  chặt chẽ tuỳ tiện.
  - **Đánh đổi, nói thẳng**: lượt 2 cũ bắt được một cửa sổ race hẹp (đối thủ commit đúng giữa lần đọc
    của lượt 1 và lượt 2). Bỏ nó thì cửa sổ đó rộng ra bằng đúng mọi module khác trong repo — không
    phải mất một đảm bảo thật (lượt 2 chưa từng khoá gì để đảm bảo), mà là bỏ một giảm nhẹ bán phần
    để đổi lấy code đơn giản hơn. Nếu sau này thật sự cần chặn race, cách đúng là khoá hàng (`FOR
    UPDATE`) hoặc ràng buộc DB, không phải đọc lại lần hai không khoá.
  - **Cảnh báo "Đừng bỏ `excludeOrderId`/`excludeReceiptId`" ở mục Hệ quả bên dưới đã hết hiệu lực**
    — hai tham số đó chỉ tồn tại để phục vụ lượt 2 vừa xoá; `getSentQuantityByJobOperationIds`/
    `getReceivedQuantityByOrderItemIds` giờ không còn tham số này nữa.
- **Cập nhật — OS-IN khớp OS-OUT: bỏ `progress`/`totalQuantity`/`items` khỏi cả list lẫn detail**:
  `GET /outsourcing-receipts`/`GET /outsourcing-receipts/:id` giờ chỉ trả thông tin header, cùng
  khuôn OS-OUT (bullet ở trên). Danh sách dòng chuyển sang route riêng
  `GET /outsourcing-receipts/:outsourcingReceiptId/items` (tái dùng `OutsourcingReceiptItemResDto`
  có sẵn). Enum `OutsourcingReceiptProgress` cùng `resolveReceiptProgress`/`resolveReceiptWithProgress`/
  `getReceiptIdsWithPendingIqc` xoá hoàn toàn (không còn consumer) — `outsourcing-receipts.constant.ts`
  và `types/outsourcing-receipt-detail.type.ts` xoá cả file.
- **Cập nhật — OS-OUT bỏ sạch resolve/validate phía server, client gửi đủ cột dòng**:
  `OutsourcingOrderItemReqDto` phình thêm `productionJobId`/`itemId`/`operationId`/`operationCode`/
  `operationName` — client lấy đúng các giá trị này từ popup `GET .../outsourceable-operations` (đã
  trả sẵn) rồi gửi thẳng lại, không chỉ gửi `productionJobOperationId` nữa. `createOutsourcingOrder`
  xoá `resolveJobOperationSources`/`resolveOrderItems`/`ensureQuantityWithinPlanned` — chỉ còn
  `validateOrderItems` (shape thuần: `items[]` không rỗng, không trùng `productionJobOperationId`)
  rồi `INSERT` thẳng dòng client gửi. `E166`/`E167`/`E168`/`E184` mất throw site duy nhất, chuyển
  **dự phòng** (comment tại chỗ khai báo, `src/constants/error-code.constant.ts`); 2 cột snapshot
  `outsourcing_order_items.plannedQuantity`/`sentBeforeQuantity` **drop hẳn**
  (`drizzle/0115_military_switch.sql`) — không còn ai ghi.
  - **Đánh đổi, nói thẳng**: server không còn kiểm gì về tính hợp lệ của dòng OS-OUT. Mất `E166`
    (công đoạn không phải `OUTSOURCE`), `E167` (Job không `IN_PROGRESS`), `E168` (BOM node mất
    `itemId`), và quan trọng nhất **`E184` — chặn gửi vượt định mức Job, chốt duy nhất nối OS-OUT
    vào kế hoạch sản xuất, giờ không giới hạn**. `productionJobOperationId`/`itemId` sai hoặc không
    khớp nhau: id không tồn tại → FK violation → 500 thô (mất `E091` 404 gọn); id tồn tại nhưng
    không khớp nhau → dữ liệu bẩn ghi thẳng vào DB, không phát hiện được. Đây không phải thiếu sót —
    là điều kiện đổi lấy: bỏ 2 lượt round-trip DB mỗi lần tạo phiếu, dữ liệu client gửi đã có sẵn
    nguyên vẹn từ đúng popup vài giây trước. Nếu sau này lộ ra vấn đề thật (client gửi sai do bug
    FE, hoặc cần validate lại vì Job đổi trạng thái giữa lúc mở popup và lúc submit), quay lại
    resolve/validate phía server là việc **thêm mới**, không phải khôi phục — code cũ không giữ lại
    dạng nào.
  - **OS-IN cố tình lệch OS-OUT sau đợt này** — `resolveReceiptItems`/`E171`/`E172`/`E187` giữ
    nguyên 100%, `createOutsourcingReceipt` vẫn tự resolve/validate từ `outsourcingOrderItemId`.
    Đừng "đồng bộ hoá" hai module lại giống nhau mà không hỏi lại — đây là quyết định có chủ đích,
    không phải một module bị bỏ sót.

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
