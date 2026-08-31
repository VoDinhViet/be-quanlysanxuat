# Lập / post / cancel phiếu điều chỉnh tồn kho

Chứng từ dành riêng cho kiểm kê/hao hụt — trước đây phải mượn `receiptType`/`issueType =
ADJUSTMENT` trên phiếu nhập/xuất, tách bảng riêng để một lần kiểm kê có cả hàng thừa lẫn hàng thiếu
đi chung một phiếu và có chỗ lưu lý do. Mô hình phiếu/sổ cái/tồn chung: `docs/domains/inventory.md`.
`post`/`cancel` dùng chung cơ chế `InventoryPostingService` với `docs/workflows/stock-movement.md`,
khác ở chỗ không có bước `confirm` (giống phiếu xuất).

## Trigger

`POST`/`PATCH`/`DELETE`/`POST .../post`/`POST .../cancel` cho `inventory-adjustments`. Luôn là thao
tác tay — kiểm kê định kỳ hoặc phát hiện hao hụt/hư hỏng, không có nghiệp vụ nào khác trong hệ thống
tự sinh loại phiếu này.

## Actor

`inventory:create` (lập phiếu) / `inventory:update` (sửa, `post`, `cancel`) / `inventory:delete`
(xoá phiếu `DRAFT`) — dùng chung namespace quyền với `inventory-receipts`/`inventory-issues`, không
thêm quyền riêng.

## Preconditions

Lập/sửa phiếu — chạy trước transaction:

1. Mọi dòng có `itemId` trỏ tới một item còn sống.
2. Không trùng `itemId` trong cùng payload.
3. `unitId` (nếu gửi) chỉ cần là một `units.id` hợp lệ — thuần hiển thị, không quy đổi
   (`docs/decisions/unit-conversion.md`).

`PATCH`/`DELETE`/`post`/`cancel` đều mở đầu bằng kiểm phiếu tồn tại + đúng trạng thái cho phép.

## Flow

### Lập / sửa (`DRAFT`)

1. Validate ở trên (toàn bộ là đọc).
2. **Transaction**: ghi header + toàn bộ dòng phiếu (`PATCH` là replace-all items) — `unitId` mặc
   định đơn vị gốc của item nếu payload không gửi.
3. Đọc lại chi tiết phiếu để trả về.

Không đụng `inventory_transactions`/`inventory_balances` ở bước này.

### `post`

**Transaction** — khoá dòng phiếu bằng `SELECT … FOR UPDATE` trước, cùng cơ chế chống double-submit
như phiếu nhập/xuất (`docs/workflows/stock-movement.md`):

1. Khoá + đọc phiếu, kiểm `status = DRAFT`.
2. Với mỗi dòng: `SELECT … FOR UPDATE` dòng `inventory_balances` khớp `itemId` (tạo dòng mới nếu
   chưa có) → cộng (`adjustmentType = INCREASE`) hoặc trừ (`DECREASE`) đúng `quantity` → nếu kết
   quả `< 0`, ném lỗi thiếu tồn và rollback toàn bộ phiếu → `INSERT`/`UPDATE` balance → `INSERT` một
   dòng `inventory_transactions` (`type = ADJUSTMENT_IN`/`ADJUSTMENT_OUT`,
   `referenceType = INVENTORY_ADJUSTMENT`).
3. Cập nhật phiếu: `status = POSTED`, `postedBy`, `postedAt`.
4. `204`, không trả nội dung.

### `cancel`

Cùng khuôn phiếu nhập/xuất: khoá phiếu, nếu đang `POSTED` thì đảo dấu mọi bút toán đã sinh (append
mới, không xoá), cộng dồn ngược vào balance, đổi `status = CANCELLED`. Không có đường
`CANCELLED → *`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `inventory_adjustments` | lập | *(chưa có)* | `DRAFT` |
| `inventory_adjustments.status` | `post` | `DRAFT` | `POSTED` |
| `inventory_adjustments.status` | `cancel` | `DRAFT`/`POSTED` | `CANCELLED` |
| `inventory_balances` | `post` | — | tăng (`INCREASE`)/giảm (`DECREASE`) theo `quantity` |
| `inventory_balances` | `cancel` (từ `POSTED`) | — | đảo ngược đúng phần đã `post` |

## Side effects

- `post`: N dòng `inventory_transactions` mới (append-only), `inventory_balances` cập nhật.
- `cancel` từ `POSTED`: thêm N dòng `inventory_transactions` đảo dấu.
- Không cascade sang module khác — khác phiếu nhập `PRODUCTION`/phiếu xuất từ phiếu lãnh, phiếu điều
  chỉnh không đụng `production_jobs`/`purchase_orders`/`payment_requests`.

## Transaction boundary

`post`/`cancel` bao đúng: khoá dòng phiếu + cập nhật `inventory_balances` (khoá `FOR UPDATE`) + ghi
`inventory_transactions` + đổi `status` phiếu — toàn bộ trong một transaction, cùng khuôn
`docs/workflows/stock-movement.md`.

## Related docs

- `docs/domains/inventory.md` — mô hình phiếu/sổ cái/tồn.
- `docs/workflows/stock-movement.md` — cơ chế `post`/`cancel` dùng chung, khoá dòng balance.
- `docs/decisions/unit-conversion.md` — `unitId` trên dòng phiếu chỉ để hiển thị.

Code: `InventoryAdjustmentsService`, `InventoryPostingService.postDocument`/`reverseDocument`.
