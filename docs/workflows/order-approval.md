# Duyệt / từ chối đơn hàng

Ranh giới quan trọng nhất của hệ thống: đây là chỗ một chứng từ thương mại biến thành đầu vào sản
xuất. Khái niệm và bất biến ở `docs/domains/orders.md`; file này mô tả **trình tự chạy**.

## Trigger

`POST /orders/:orderId/approve` — Giám đốc bấm "Duyệt".
`POST /orders/:orderId/reject` — bấm "Từ chối", bắt buộc kèm `reason`.

Không có trigger tự động, không có job nền, không có hạn duyệt.

## Actor

Cả hai route đòi `orders:approve` — permission **riêng**, tách khỏi `orders:update` để người sửa đơn
không tự duyệt được đơn của mình.

⚠️ Trong `credentials.seed.ts` hiện **không role nào được cấp `orders:approve`** (kể cả `DIRECTOR`).
Chỉ `ADMIN` chạy được, nhờ `system:manage` vượt mọi kiểm tra. Xem
`docs/domains/identity-access.md`.

## Preconditions

- Đơn tồn tại và chưa xoá mềm (`E057`).
- Đơn đang `PENDING_CONFIRMATION` (`E074`). Đơn `DRAFT` chưa gửi duyệt thì không duyệt được, đơn đã
  qua cổng này rồi cũng không duyệt lại được.

Bước đưa đơn tới `PENDING_CONFIRMATION` là một `PATCH /orders/:orderId` đổi `status` bình thường
(quyền `orders:update`) — **không có route "gửi duyệt" riêng**.

## Flow

### Duyệt

1. Đọc đơn, kiểm hai precondition trên.
2. **Ngoài transaction** — dựng kế hoạch sản xuất ban đầu:
   - Lấy mọi dòng đơn `status = NORMAL` (dòng `CANCELLED` không cần sản xuất). Không có dòng nào →
     kế hoạch rỗng, thoát sớm, không gọi tới kho.
   - Gom `itemId` duy nhất, hỏi kho **một lần** cho cả lô, truyền `excludeOrderId` = chính đơn
     này.
   - Với mỗi dòng, tính Đề xuất SX / Lấy từ tồn theo công thức ở `docs/domains/production.md`.
3. **Mở transaction**:
   - Đơn → `AWAITING_PRODUCTION`, ghi `approvedBy`/`approvedAt`.
   - Xoá LSX cũ của đơn (nếu có) rồi ghi LSX mới `PENDING` + các dòng quyết định sản xuất +
     1 dòng log `CREATED`.
4. Commit, không trả body (204).

### Từ chối

Một `UPDATE` duy nhất: đơn sang `REJECTED`, ghi `rejectedBy`/`rejectedAt`/`rejectionReason`. Không
đụng gì tới sản xuất — tại thời điểm này LSX chưa tồn tại.

Từ `REJECTED`, có hai đường tiếp theo, cả hai đều qua `PATCH /orders/:orderId` bình thường (quyền
`orders:update`), không phải route riêng của workflow này:
- Gửi kèm `status = PENDING_CONFIRMATION` → gửi duyệt lại ngay, không cần sửa gì.
- Không gửi `status` (sửa field khác) → tự động về `DRAFT`, giữ nguyên `rejectedBy`/`rejectedAt`/
  `rejectionReason` làm lịch sử — `OrdersService.updateOrder`, chi tiết ở `docs/domains/orders.md`.

## State changes

| Entity | Trước | Sau |
| --- | --- | --- |
| `orders` (duyệt) | `PENDING_CONFIRMATION` | `AWAITING_PRODUCTION` |
| `orders` (từ chối) | `PENDING_CONFIRMATION` | `REJECTED` |
| `orders` (gửi duyệt lại) | `REJECTED` | `PENDING_CONFIRMATION` |
| `orders` (sửa không kèm status) | `REJECTED` | `DRAFT` |
| `production_orders` | *(chưa có)* | `PENDING`, `code` NULL |

## Side effects

Chỉ khi duyệt:

- 1 `production_orders` (header LSX, chưa có mã — mã chỉ sinh lúc duyệt LSX).
- N `production_order_items` — mỗi dòng đơn `NORMAL` một dòng, kèm **ảnh chụp tồn kho**
  (`onHandQty`/`availableQty`) tại đúng thời điểm này.
- 1 `production_order_logs` action `CREATED`.

**Không** sinh phiếu kho, **không** sinh Job, **không** gửi thông báo.

Duyệt lại một đơn từng bị từ chối là **replace-all**: LSX cũ bị xoá (cascade dọn cả dòng quyết định
sản xuất) rồi ghi lại từ đầu — số liệu tồn kho được tính lại theo thời điểm duyệt mới.

## Transaction boundary

Mở **sau** toàn bộ phần đọc, bao đúng hai việc: đổi trạng thái đơn và ghi hồ sơ LSX. Lý do gộp: một
đơn `AWAITING_PRODUCTION` mà màn LSX không có gì để hiển thị là trạng thái "duyệt nửa vời".

Hệ quả của việc tính kế hoạch ở ngoài: giữa lúc đọc tồn và lúc commit, người khác vẫn lập được phiếu
kho — con số trong LSX là **snapshot**, chấp nhận lệch (xem `docs/domains/production.md`).

## Failure cases

| Tình huống | Mã | Kết quả |
| --- | --- | --- |
| Đơn không tồn tại / đã xoá mềm | `E057` | 404, không ghi gì |
| Đơn không ở `PENDING_CONFIRMATION` | `E074` | 409, không ghi gì |
| Lỗi bất kỳ trong transaction | — | Rollback toàn bộ: đơn giữ nguyên trạng thái, không có LSX mồ côi |

Không có nhánh lỗi nào liên quan tồn kho — **duyệt đơn không bao giờ bị kho chặn**, kể cả khi hụt
hàng nghiêm trọng.

## Business rules

Nằm ở domain doc, không lặp lại ở đây:

- Vì sao `AWAITING_PRODUCTION` không set được bằng `PATCH` → `docs/domains/orders.md`.
- Công thức Đề xuất SX và vì sao phải `excludeOrderId` → `docs/domains/production.md`.
- Vì sao đơn chưa duyệt không giữ chỗ tồn kho → `docs/domains/inventory.md`.

## Related domains

`orders` → `production` (seed kế hoạch), đọc `inventory`.

Bước kế tiếp: `docs/workflows/production-order-approval.md`.

Code: `OrdersService.approveOrder`/`rejectOrder`, `ProductionOrdersService.getInitialPlanItems`/
`seedPlan`, `InventoryService.getStockLevels`.
