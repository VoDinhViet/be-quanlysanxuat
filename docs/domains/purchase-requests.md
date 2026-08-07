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

**Chưa có route tạo/sửa/duyệt/từ chối.** Đường ghi duy nhất vào `purchase_requests`/
`purchase_request_items` không phải một route của module này, mà là hệ quả của
`POST /production-jobs/:jobId/start`: vật tư nào của Job thiếu tồn thì tự sinh một đề xuất cho đúng
phần thiếu, xem `docs/workflows/production-job-execution.md`. Phiếu sinh ra luôn `status = DRAFT`,
gắn cả `productionOrderId` lẫn `productionJobId`, SL mỗi dòng là **phần thiếu**
(`requiredQty − onHand` tại thời điểm start), không phải toàn bộ nhu cầu của Job. `status` đã định
nghĩa đủ 4 giá trị cho vòng đời tương lai, nhưng chưa có route nào chuyển trạng thái sau khi sinh.

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_requests` | Header — mã phiếu, ngày cần, bộ phận, LSX (tuỳ chọn), người đề xuất, trạng thái |
| `purchase_request_items` | Dòng vật tư của phiếu — `itemId` (trỏ `items`, luôn RM trong thực tế) + `quantity` |

## Lifecycle

`DRAFT` → `PENDING_APPROVAL` → `APPROVED` / `REJECTED`. Chưa có route nào ghi trạng thái — enum
tồn tại trước để schema không phải đổi khi giai đoạn sau thêm route tạo/duyệt.

## Business rules

- `code` bất biến, unique toàn bảng.
- Mỗi dòng `purchase_request_items.quantity` phải dương (DB CHECK).
- Không có soft delete — chưa có route xoá nào được yêu cầu (`.claude/rules/database.md`).

## Cross-domain dependencies

- **← Production**: `ProductionJobsService.startJob` là domain khác **duy nhất ghi vào** đây —
  `productionOrderId`/`productionJobId` trỏ `production_orders`/`production_jobs`, cả hai tuỳ chọn.
- **→ Partners**: `departmentId` trỏ danh mục `departments`.
- **→ Product Structure**: dòng phiếu trỏ `items` (`itemId`), xem `docs/domains/product-structure.md`.
- **→ Identity**: `createdBy` trỏ `users.id` — người bấm start, không phải người "đề xuất" theo
  nghĩa tự tay lập phiếu.

## Common mistakes

1. **Tưởng đây là bước đầu của procurement.** Không — xem `docs/decisions/no-procurement.md`.
2. **Đi tìm route tạo/duyệt/từ chối.** Chưa có route nào — đường ghi duy nhất là hệ quả tự động của
   `startJob`, không phải API trực tiếp của module này.

## Related docs

- `docs/decisions/no-procurement.md` — ranh giới không làm procurement thật.
- `docs/domains/production.md` — nơi `production_orders` (LSX) sống.
- `docs/domains/partners.md` — nơi `departments` sống.
- `docs/domains/product-structure.md` — nơi `items` (vật tư) sống.
