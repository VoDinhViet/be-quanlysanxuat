# Purchase Requests (Đề xuất mua hàng)

## Purpose

Luồng xin duyệt nội bộ khi một bộ phận (thường Sản xuất) cần mua vật tư — không supplier, không
giá, không nhận hàng theo phiếu. Xem ranh giới ở `docs/decisions/purchasing-scope-limits.md`.

## Core concepts

**Không phải procurement tự thân** — `purchase_requests` chỉ là phiếu xin duyệt: ai cần gì, bao
nhiêu, khi nào, cho LSX nào (tuỳ chọn). Sau khi `APPROVED`, dòng tiếp tục sang báo giá/PO thật ở
`docs/domains/purchasing.md`.

**Gắn LSX là tuỳ chọn.** `productionOrderId` cho biết đề xuất phát sinh từ thiếu vật tư của một LSX
cụ thể; `NULL` là đề xuất chung. `productionJobId` thu hẹp thêm một bậc (LSX có nhiều Job); cũng
`NULL` được.

**Hai đường tạo phiếu:**
- **Tay**: `POST /purchase-requests` — luôn `DRAFT`, `productionOrderId`/`productionJobId` luôn
  `NULL`, mọi dòng bắt buộc `type = RM`.
- **Tự động**: hệ quả của `POST /production-jobs/:jobId/start` — vật tư thiếu tồn tự sinh đề xuất
  cho đúng phần thiếu (`docs/workflows/production-job-execution.md`). Luôn `DRAFT`, gắn cả
  `productionOrderId` lẫn `productionJobId`, SL mỗi dòng = phần thiếu (`requiredQty − onHand` tại
  thời điểm start), không phải toàn bộ nhu cầu Job.

Sau khi sinh: `PATCH`/`DELETE .../items/:purchaseRequestItemId` sửa/xoá dòng (chỉ khi `DRAFT`/
`REJECTED`) → `POST .../send` gửi duyệt → `POST .../approve`/`.../reject` (kèm lý do). Bỏ cả phiếu:
`DELETE /purchase-requests/:purchaseRequestId` (cũng chỉ `DRAFT`/`REJECTED`).

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_requests` | Header — mã phiếu, ngày cần, bộ phận, LSX (tuỳ chọn), trạng thái |
| `purchase_request_items` | Dòng — `itemId` (bắt buộc `type=RM`, `E148`) + `quantity` + `note` |

## Lifecycle

```
DRAFT ──send (purchase-requests:update)──> PENDING_APPROVAL
PENDING_APPROVAL ──approve (purchase-requests:approve)──> APPROVED
PENDING_APPROVAL ──reject (purchase-requests:approve, lý do bắt buộc)──> REJECTED
```

`APPROVED` là điểm cuối của module này — dòng tiếp tục sang `docs/domains/purchasing.md`, không ghi
ngược. `REJECTED` không có route "quay lại DRAFT" — nhưng sửa/xoá một dòng vật tư tự động đưa
`status` về `DRAFT` (giữ nguyên `rejectedBy`/`rejectedAt`/`rejectionReason` làm lịch sử).
`PENDING_APPROVAL`/`APPROVED` khoá cứng sửa/xoá dòng (`E114`).

Xoá cả phiếu nằm ngoài state machine trên — không có `CANCELLED`, xoá là cơ chế loại bỏ duy nhất,
chỉ mở ở `DRAFT`/`REJECTED` (không tự đưa `REJECTED` về `DRAFT` trước).

## Business rules

- `code` bất biến, unique, cấp qua `document_sequences` (không đếm trên chính bảng — có `DELETE`
  nên đếm sẽ cấp lại mã đã tồn tại).
- `quantity` mỗi dòng phải dương (DB CHECK). Không soft delete cho header — xoá phiếu là hard
  delete, dòng theo `ON DELETE CASCADE`.
- Xoá dòng phải giữ ≥1 dòng còn lại (`E115`); tạo tay chặn `items` rỗng (`E146`), trùng `itemId`
  trong payload (`E147`), dòng không `type=RM` (`E148`).
- `send` chỉ hợp lệ từ đúng `DRAFT`. Duyệt/từ chối chỉ hợp lệ từ `PENDING_APPROVAL` (`E116`).
- `purchase-requests:approve` tách khỏi `:update` — chỉ DIRECTOR. `:create`/`:delete` tách riêng —
  hiện chỉ PURCHASING được cấp cả hai; PRODUCTION/WAREHOUSE chỉ có `:read`.
- Dòng chi tiết (`GET /purchase-requests/:id`) mang 4 số tính lúc đọc (`onHand`/`bomDemand`/
  `available`/`fromStock`), công thức dùng chung `item-stock.query.ts` —
  `docs/domains/inventory.md`.

## Invariants

- `purchase_request_items.cancelledAt`/`cancelledBy`/`cancellationReason` tồn tại trên schema
  nhưng **chưa route nào ghi** — luôn `NULL`; `purchase-orders`/`purchase-quotations` đọc
  `isNull(cancelledAt)` khi validate nhưng luôn nhận `true` trong thực tế hiện tại.
- Một dòng ĐXMH chỉ vào được báo giá/PO khi phiếu đã `APPROVED` — `APPROVED` là trạng thái cuối,
  không quay lại `DRAFT`/`REJECTED`, nên FK `restrict` trên `purchaseRequestItemId` không bao giờ
  chặn xoá bằng lỗi FK thô ở phía `purchase_requests`.

## Cross-domain dependencies

- **← Production**: `startJob` là domain khác duy nhất ghi vào đây (đường tự động).
- **→ Partners**: `departmentId`.
- **→ Product Structure**: dòng phiếu trỏ `items`.
- **→ Identity**: `createdBy` trỏ `users.id`.
- **→ Inventory**: `inventory_receipts.purchaseRequestId` là `set null` — xoá đề xuất không chặn dù
  phiếu nhập từng trỏ tới nó.
- **→ Purchasing**: dòng `APPROVED` tiếp tục sang RFQ/PO — `docs/domains/purchasing.md`.

## Common mistakes

1. Đây không phải bước đầu của procurement thật — `docs/decisions/purchasing-scope-limits.md`.
2. Đề xuất lập tay không gắn được LSX/Job (`ValidationPipe` loại bỏ nếu gửi) — `bomDemand`/
   `fromStock` luôn `0` trên detail của phiếu lập tay. Đúng thiết kế.
3. `REJECTED` không có route riêng "mở lại" — sửa/xoá dòng tự đưa về `DRAFT`.
4. `onHand` (đọc lúc gọi API) và `quantity` (đóng băng lúc `startJob`) ở hai mốc thời gian khác
   nhau — không trừ trực tiếp cho nhau để suy "còn thiếu bao nhiêu".
5. `bomDemand` là nhu cầu của cả Job/LSX liên quan, `quantity` là phần thiếu riêng dòng này — hai
   đại lượng khác nhau, không so trực tiếp.

## Related docs

- `docs/decisions/purchasing-scope-limits.md` — ranh giới không làm procurement thật.
- `docs/domains/production.md`, `docs/domains/partners.md`, `docs/domains/product-structure.md`.
- `docs/domains/purchasing.md` — nơi đề xuất `APPROVED` tiếp tục.
