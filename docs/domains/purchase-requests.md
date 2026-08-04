# Purchase Requests (Đề xuất mua hàng)

## Purpose

Luồng xin duyệt nội bộ khi một bộ phận (thường là Sản xuất) cần mua vật tư — không phải
procurement thật: không supplier, không giá, không nhận hàng theo đơn mua. Xem ranh giới ở
`docs/decisions/no-procurement.md`.

## Core concepts

**Không phải procurement.** `purchase_requests` chỉ là phiếu xin duyệt nội bộ: ai cần gì, bao
nhiêu, khi nào cần, cho LSX nào (tuỳ chọn). Không có `supplierId`, không có đơn giá, không có
nhận hàng theo phiếu. Đây không phải điểm khởi đầu của procurement thật nếu sau này hệ thống làm
— điểm cắm thật (nếu làm) vẫn là `stock_receipts` theo `docs/decisions/no-procurement.md`.

**Gắn LSX là tuỳ chọn.** `productionOrderId` cho biết đề xuất phát sinh từ việc thiếu vật tư của
một LSX cụ thể; `NULL` là đề xuất chung (vd mua dự trữ), không gắn LSX nào.

**Giai đoạn 1 — chỉ có danh sách.** Repo hiện chỉ có `GET /purchase-requests` (danh sách, phân
trang, filter). Chưa có API tạo/sửa/duyệt/từ chối — dữ liệu vào bằng tay/seed cho tới khi giai
đoạn sau bổ sung. `status` đã định nghĩa đủ 4 giá trị cho vòng đời tương lai, nhưng chưa có route
nào chuyển trạng thái.

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_requests` | Header — mã phiếu, ngày cần, bộ phận, LSX (tuỳ chọn), người đề xuất, trạng thái |
| `purchase_request_items` | Dòng vật tư của phiếu — `materialId` + `quantity` |

## Lifecycle

`DRAFT` → `PENDING_APPROVAL` → `APPROVED` / `REJECTED`. Chưa có route nào ghi trạng thái — enum
tồn tại trước để schema không phải đổi khi giai đoạn sau thêm route tạo/duyệt.

## Business rules

- `code` bất biến, unique toàn bảng.
- Mỗi dòng `purchase_request_items.quantity` phải dương (DB CHECK).
- Không có soft delete — chưa có route xoá nào được yêu cầu (`.claude/rules/database.md`).

## Cross-domain dependencies

- **→ Production**: `productionOrderId` trỏ `production_orders` (LSX), tuỳ chọn.
- **→ Partners**: `departmentId` trỏ danh mục `departments`; dòng phiếu trỏ `materials`.
- **→ Identity**: `createdBy` trỏ `users.id` — người đề xuất.

## Common mistakes

1. **Tưởng đây là bước đầu của procurement.** Không — xem `docs/decisions/no-procurement.md`.
2. **Đi tìm route tạo/duyệt/từ chối.** Chưa có ở giai đoạn 1, chỉ có danh sách.

## Related docs

- `docs/decisions/no-procurement.md` — ranh giới không làm procurement thật.
- `docs/domains/production.md` — nơi `production_orders` (LSX) sống.
- `docs/domains/partners.md` — nơi `materials`/`departments` sống.
