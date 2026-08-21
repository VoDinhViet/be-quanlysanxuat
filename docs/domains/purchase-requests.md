# Purchase Requests (Đề xuất mua hàng)

## Purpose

Luồng xin duyệt nội bộ khi một bộ phận (thường là Sản xuất) cần mua vật tư — không phải
procurement thật: không supplier, không giá, không nhận hàng theo đơn mua. Xem ranh giới ở
`docs/decisions/no-procurement.md`.

## Core concepts

**Không phải procurement.** `purchase_requests` chỉ là phiếu xin duyệt nội bộ: ai cần gì, bao
nhiêu, khi nào cần, cho LSX nào (tuỳ chọn). Không có `supplierId`, không có đơn giá, không có
nhận hàng theo phiếu. Đây không phải điểm khởi đầu của procurement thật nếu sau này hệ thống làm
— điểm cắm thật (nếu làm) vẫn là `inventory_receipts` theo `docs/decisions/no-procurement.md`.

**Gắn LSX là tuỳ chọn.** `productionOrderId` cho biết đề xuất phát sinh từ việc thiếu vật tư của
một LSX cụ thể; `NULL` là đề xuất chung (vd mua dự trữ), không gắn LSX nào. `productionJobId` thu hẹp
thêm một bậc — LSX có nhiều Job, cột này cho biết đúng Job nào đã sinh ra đề xuất; cũng `NULL` được.

**Có list + detail + gửi duyệt/duyệt/từ chối — hai đường tạo phiếu.** **Tay**: `POST
/purchase-requests` — luôn `status = DRAFT`, `productionOrderId`/`productionJobId` luôn `NULL`
(luôn là đề xuất chung), `neededDate`/`departmentId`/`quantity` lấy nguyên từ body người gọi gửi
lên, mọi dòng bắt buộc `type = RM`. **Tự động**: hệ quả của `POST /production-jobs/:jobId/start` —
vật tư nào của Job thiếu tồn thì tự sinh một đề xuất cho đúng phần thiếu, xem
`docs/workflows/production-job-execution.md`. Phiếu sinh ra luôn `status = DRAFT`, gắn cả
`productionOrderId` lẫn `productionJobId`, SL mỗi dòng là **phần thiếu**
(`requiredQty − onHand` tại thời điểm start), không phải toàn bộ nhu cầu của Job.

Sau khi sinh, người dùng chỉnh lại `quantity` ("SL đề xuất")/`note` của từng dòng qua
`PATCH /purchase-requests/:purchaseRequestId/items/:purchaseRequestItemId`, hoặc xoá hẳn một dòng
qua `DELETE` cùng path — cả hai chạy được khi đề xuất `DRAFT` **hoặc** `REJECTED` (xem Lifecycle).
Xong thì `POST .../send` gửi duyệt, Giám đốc `POST .../approve` hoặc `POST .../reject` (kèm lý do).
Muốn bỏ hẳn cả phiếu (không chỉ một dòng) thì `DELETE /purchase-requests/:purchaseRequestId`, cũng
chỉ chạy được khi `DRAFT`/`REJECTED`.

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_requests` | Header — mã phiếu, ngày cần, bộ phận, LSX (tuỳ chọn), người đề xuất, trạng thái |
| `purchase_request_items` | Dòng vật tư của phiếu — `itemId` (trỏ `items`, bắt buộc `type = RM`, `E148`) + `quantity` + `note` (tuỳ chọn) |

## Lifecycle

```
DRAFT ──send (purchase-requests:update)──> PENDING_APPROVAL
PENDING_APPROVAL ──approve (purchase-requests:approve)──> APPROVED
PENDING_APPROVAL ──reject (purchase-requests:approve, lý do bắt buộc)──> REJECTED
```

`APPROVED` là điểm cuối **của module này** — từ đây, từng dòng vật tư tiếp tục sang báo giá/đơn mua
ở `docs/domains/purchasing.md` (`GET /purchase-ledger`), một domain khác đọc `purchase_request_items`
đã duyệt, không ghi ngược. `REJECTED` **không có route "quay lại DRAFT"** — nhưng sửa hoặc xoá
một dòng vật tư của phiếu `REJECTED` (`PATCH`/`DELETE .../items/:id`) tự động đưa `status` về
`DRAFT` như một hiệu ứng phụ, giữ nguyên `rejectedBy`/`rejectedAt`/`rejectionReason` làm lịch sử —
coi như "sửa lại từ đầu rồi gửi duyệt lại", không phải một hành động huỷ từ chối riêng
(`PurchaseRequestsService.ensurePurchaseRequestEditable`). `PENDING_APPROVAL`/`APPROVED` khoá cứng
sửa/xoá dòng (`E114`).

Xoá cả phiếu (`deletePurchaseRequest`) nằm **ngoài** state machine trên — không có `CANCELLED` như
`inventory_receipts`/`inventory_issues`/`purchase_orders`, nên với module này xoá là cơ chế loại bỏ
duy nhất, chỉ mở ở `DRAFT`/`REJECTED` (khác edit dòng, xoá **không** tự đưa `REJECTED` về `DRAFT`
trước). Chính cổng `DRAFT`/`REJECTED` này là thứ giữ cho `purchase_quotation_items`/
`purchase_order_items` (FK `restrict` trên `purchaseRequestItemId`) không bao giờ chặn xoá bằng
lỗi FK thô: một dòng ĐXMH chỉ vào được báo giá/PO khi phiếu đã `APPROVED`, và `APPROVED` là trạng
thái cuối, không có đường quay lại `DRAFT`/`REJECTED`.

## Business rules

- `code` bất biến, unique toàn bảng.
- Mỗi dòng `purchase_request_items.quantity` phải dương (DB CHECK).
- Không có soft delete cho header — `purchase_requests` không có `deletedAt`. Xoá cả phiếu là hard
  delete (`DELETE /purchase-requests/:purchaseRequestId`, chỉ `DRAFT`/`REJECTED`, `purchase-requests:
  delete`), dòng vật tư đi theo qua `ON DELETE CASCADE`. Dòng vật tư riêng lẻ thì hard-delete được
  qua `DELETE .../items/:purchaseRequestItemId`.
- Sửa/xoá dòng vật tư được khi đề xuất `DRAFT` hoặc `REJECTED` (`REJECTED` tự về `DRAFT`, xem
  Lifecycle) — `PENDING_APPROVAL`/`APPROVED` từ chối `E114`.
- Xoá dòng vật tư phải giữ **≥ 1 dòng còn lại** — `E115` nếu đây là dòng cuối cùng (một phiếu 0
  dòng vẫn `send`/`approve` được vì không route nào đếm dòng, sẽ thành chứng từ rỗng trên sổ cái
  mua hàng). Bỏ hẳn phiếu thì dùng `DELETE /purchase-requests/:purchaseRequestId`.
- Gửi duyệt (`send`) chỉ hợp lệ từ đúng `DRAFT` (không tự mở như sửa/xoá dòng) — phiếu `REJECTED`
  phải qua một lần sửa/xoá dòng (tự về `DRAFT`) trước khi gửi lại được.
- Duyệt/từ chối chỉ hợp lệ từ đúng `PENDING_APPROVAL` — sai trạng thái trả `E116`. Từ chối bắt buộc
  `reason` (≤ 1000 ký tự).
- `purchase-requests:approve` là permission riêng, tách khỏi `:update` — người gửi duyệt (vd
  `PURCHASING`) không tự duyệt được, khuôn `orders:approve`/`production:approve`. Chỉ `DIRECTOR`
  được cấp.
- `purchase-requests:create` (lập tay) cũng tách riêng, khuôn `orders:create`/`purchasing:create`.
  Hiện **chỉ `PURCHASING`** được cấp. `PRODUCTION`/`WAREHOUSE` mới có `:read` — muốn cho họ tự lập
  phải cấp thêm **cả** `:create` lẫn `:update` (thiếu `:update` thì tạo xong không `send` được), mà
  `:update` không lọc theo chủ sở hữu nên sẽ mở luôn quyền sửa/xoá dòng của **mọi** phiếu trong hệ
  thống, không riêng phiếu họ tạo — đó là quyết định phân quyền riêng, chưa làm.
- `purchase-requests:delete` (xoá cả phiếu) tách riêng khỏi `:update`, khuôn `inventory:delete`/
  `purchasing:delete`. Hiện cũng chỉ `PURCHASING` được cấp, cùng lý do với `:create`.
- `code` cấp qua bảng đếm dùng chung `document_sequences` (`docs/architecture.md`, mục "Bất biến
  xuyên module"), không đếm trên chính bảng — vì có `DELETE`, đếm số dòng còn lại sẽ tụt sau mỗi lần
  xoá và cấp lại một mã đã tồn tại.
- Dòng chi tiết (`GET /purchase-requests/:id`) mang thêm 4 số tính lúc đọc, không lưu cột nào:
  `onHand` (tồn gộp mọi kho), `bomDemand` (Σ `production_job_issues.requiredQty` của Job/LSX
  gắn với đề xuất), `available = onHand − bomDemand` (có thể âm), `fromStock = min(onHand, bomDemand)`.
  Công thức dùng chung với `InventoryReceiptsService`, sống ở
  `src/api/inventory/item-stock.query.ts` (`docs/domains/inventory.md`, khối "Bốn số khác").
- Đề xuất lập tay (`POST /purchase-requests`): `items` tối thiểu 1 dòng (`E146`, không có route xoá
  cả phiếu nên phiếu 0 dòng sống vĩnh viễn), không trùng `itemId` trong cùng payload (`E147`, tránh
  nhân đôi nhu cầu trên sổ cái mua hàng), mọi dòng bắt buộc `type = RM` (`E148`).

## Cross-domain dependencies

- **← Production**: `ProductionJobsService.startJob` là domain khác **duy nhất ghi vào** đây (đường
  tự động) — `productionOrderId`/`productionJobId` trỏ `production_orders`/`production_jobs`, cả
  hai tuỳ chọn và luôn `NULL` trên đường tay.
- **→ Partners**: `departmentId` trỏ danh mục `departments`.
- **→ Product Structure**: dòng phiếu trỏ `items` (`itemId`), xem `docs/domains/product-structure.md`.
- **→ Identity**: `createdBy` trỏ `users.id` — người bấm start (đường tự động) **hoặc** người tự
  tay lập phiếu (đường tay); phân biệt hai đường bằng `productionJobId` có `NULL` hay không.
- **→ Inventory**: `inventory_receipts.purchaseRequestId` là `set null` — xoá một đề xuất làm phiếu
  nhập kho từng trỏ tới nó mất trace (`purchaseRequestId` về `NULL`) mà không bị chặn, có chủ ý.

## Common mistakes

1. **Tưởng đây là bước đầu của procurement.** Không — xem `docs/decisions/no-procurement.md`.
2. **Tưởng đề xuất lập tay cũng gắn được LSX/Job.** Không — `POST /purchase-requests` cố ý không
   nhận `productionOrderId`/`productionJobId` (`ValidationPipe` `whitelist: true` âm thầm loại bỏ
   nếu gửi lên, không báo 422), nên trên detail của phiếu lập tay `bomDemand` luôn `0`, `fromStock`
   luôn `0`, `available = onHand`. Đúng thiết kế, không phải bug. Muốn gắn LSX/Job thì chỉ có đường
   tự động.
3. **Tưởng `REJECTED` có route riêng để "mở lại"/"khôi phục".** Không có — sửa hoặc xoá bất kỳ dòng
   vật tư nào của phiếu `REJECTED` tự động đưa `status` về `DRAFT`, đó chính là cách "mở lại".
4. **Trừ `onHand` của `GET /purchase-requests/:id` cho `quantity` của từng dòng để suy ra "còn thiếu
   bao nhiêu".** Hai số ở hai mốc thời gian khác nhau: `quantity` đóng băng lúc `startJob` chốt phần
   thiếu (`requiredQty − onHand` **tại thời điểm đó**), còn `onHand` đọc **lúc gọi API**. Tồn có thể
   đã đổi (nhập/xuất kho khác diễn ra sau) — hai số không cộng/trừ được cho nhau.
5. **So `bomDemand` của dòng chi tiết với `quantity` của chính dòng đó.** `bomDemand` là nhu cầu vật
   tư của **cả Job/LSX liên quan** (mọi dòng `production_job_issues` của nó), còn `quantity` là
   phần thiếu của riêng dòng này chốt lúc `startJob` — hai số đo hai thứ khác nhau, không phải cùng
   một đại lượng ở hai thời điểm như mục 3.

## Related docs

- `docs/decisions/no-procurement.md` — ranh giới không làm procurement thật.
- `docs/domains/production.md` — nơi `production_orders` (LSX) sống.
- `docs/domains/partners.md` — nơi `departments` sống.
- `docs/domains/product-structure.md` — nơi `items` (vật tư) sống.
- `docs/domains/purchasing.md` — nơi đề xuất `APPROVED` tiếp tục: báo giá, đơn mua, sổ cái.
