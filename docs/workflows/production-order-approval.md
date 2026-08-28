# Điều chỉnh & duyệt Lệnh sản xuất (LSX)

Chặng giữa: hồ sơ LSX đã được sinh sẵn lúc duyệt đơn, xưởng xem lại số lượng rồi chốt. Khái niệm ba
tầng và bất biến ở `docs/domains/production.md`.

## Trigger

- `PATCH /production-orders/:productionOrdersId` — sửa số lượng sản xuất *(tuỳ chọn, lặp lại được)*.
- `POST /production-orders/:productionOrdersId/approve` — chốt LSX *(một lần, không lùi được)*.

Không có route tạo LSX: LSX chỉ ra đời từ `docs/workflows/order-approval.md`.

## Actor

Sửa số lượng: `production:update`. Duyệt: `production:approve` — hai quyền tách rời. Seed hiện cấp
cả hai cho DIRECTOR và PRODUCTION (`credentials.seed.ts`).

## Preconditions

| Điều kiện | Sửa SL | Duyệt |
| --- | --- | --- |
| LSX tồn tại | `E081` | `E081` |
| Đơn gốc chưa xoá mềm | `E057` | `E057` |
| LSX đang `PENDING` | `E084` | `E083` |
| Đơn gốc đang `AWAITING_PRODUCTION` | *(không kiểm)* | `E076` |
| `orderItemId` gửi lên thuộc đúng LSX này | `E078` | — |

## Flow

### Sửa số lượng (partial)

1. Đọc LSX kèm các dòng quyết định sản xuất, kiểm precondition.
2. **Ngoài transaction** — map từng `orderItemId` gửi lên về dòng tương ứng, tính lại
   `fromStockQty` từ `orderQty` và số lượng mới. Chỉ dòng được gửi bị đụng; dòng không gửi giữ
   nguyên.
3. Lấy tên sản phẩm (1 query gộp) để dựng nội dung log dạng `Tên SP 10 → 6`.
4. **Transaction**: N lệnh `UPDATE` + 1 dòng log `QUANTITY_UPDATED`.

Gửi `items: []` → không mở transaction, không ghi log. Gửi cùng `orderItemId` hai lần trong một
request → lệnh sau thắng.

**Chỉ `fromStockQty` được tính lại.** `onHandQty`/`availableQty` giữ nguyên snapshot cũ — sửa số
lượng **không** hỏi lại tồn kho.

### Duyệt

1. Đọc LSX join đơn gốc, kiểm bốn precondition.
2. **Ngoài transaction** — đọc lại các dòng quyết định sản xuất và **gộp số lượng theo
   `itemId`**, bỏ item số lượng 0. Đây là chỗ ba dòng đơn cùng một item thu về một Job.
3. **Transaction**:
   - Sinh mã `LSXxxxx` qua `document_sequences` (atomic), ghi `APPROVED` + `approvedBy`/`approvedAt`.
   - Đẩy đơn gốc `AWAITING_PRODUCTION` → `IN_PROGRESS`.
   - Sinh Job: mỗi sản phẩm một dòng, mã `JOBxxxx` cũng cấp qua `document_sequences`.
   - Nhân bản toàn bộ cây BOM (cả `WIP` lẫn `RM`) sang `production_job_bom_items` (id mới,
     `code`/`name` denormalize), rồi copy routing as-used của từng node sang
     `production_job_operations` (`code`/`name`/`type` công đoạn denormalize) — đóng băng, không
     route sửa. Không có khái niệm Cấp 0 riêng ở tầng Job.
   - Đọc lại `production_job_bom_items` vừa nhân bản (đã nổ cấp — `plannedQuantity`, xem "Chuẩn nổ
     cấp BOM" ở `docs/domains/product-structure.md`), gộp theo vật tư (`SUM(plannedQuantity) GROUP
     BY itemId`, chỉ node `RM`) thành `requiredQty`, rồi suy `unitQty = requiredQty / SL Job`. Mã/tên
     vật tư + mã/tên ĐVT không denormalize thẳng lên dòng này — get-or-create trước (theo bộ ba nội
     dung, dùng chung mọi Job/LSX) hai bảng chiều `production_job_items`/`production_job_units`, rồi
     chỉ ghi FK — xem `docs/domains/production.md`.
   - 1 dòng log `APPROVED` ghi kèm số Job đã sinh.

## State changes

| Entity | Trước | Sau |
| --- | --- | --- |
| `production_orders` | `PENDING`, `code` NULL | `APPROVED`, có `code` |
| `orders` | `AWAITING_PRODUCTION` | `IN_PROGRESS` |
| `production_jobs` | *(chưa có)* | `PENDING` |
| `production_job_bom_items` | *(chưa có)* | N dòng/Job (nhân bản cây BOM) |
| `production_job_operations` | *(chưa có)* | N dòng/Job (as-used từng node BOM) |
| `production_job_items` | *(có thể chưa có)* | 0 dòng mới nếu vật tư đã có snapshot cùng bộ ba nội dung, ngược lại +1 dòng/vật tư mới |
| `production_job_units` | *(có thể chưa có)* | Cùng cơ chế, theo ĐVT |
| `production_job_issues` | *(chưa có)* | N dòng/Job (copy BOM × SL Job) |

## Side effects

- N `production_jobs` (N = số sản phẩm phân biệt có SL > 0). Không sản phẩm nào SL > 0 → **không
  Job nào**, vẫn là duyệt hợp lệ.
- Mỗi Job kèm theo bản copy cây BOM + công đoạn as-used + vật tư. Sản phẩm không có BOM → Job đó
  không có node/công đoạn/vật tư nào — **không phải lỗi**.
- 1 `production_order_logs`.
- **Khoá gián tiếp**: từ giờ `PATCH /orders/:orderId` với `items` bị chặn (`E080`).

**Không** lập phiếu xuất kho cho phần "Lấy từ tồn", **không** kiểm tồn kho tổng hợp trước khi
duyệt. Hai điểm này ngoài phạm vi có chủ đích — xem `docs/domains/production.md`.

## Transaction boundary

Cả hai flow mở transaction sau phần đọc. Transaction duyệt bao **tám bảng ở hai domain**
(`production_orders`, `orders`, `production_jobs`, `production_job_bom_items`,
`production_job_operations`, `production_job_items`, `production_job_units`,
`production_job_issues`) — đây là transaction rộng nhất hệ thống, và là lý do `createJobs` bắt buộc
nhận `tx`. Hệ quả mới: `production_job_items`/`production_job_units` dùng chung nhiều LSX, nên duyệt
hai LSX song song cùng đụng một vật tư/ĐVT sẽ tranh chấp khoá insert của nhau trong lúc get-or-create
— trước đây transaction duyệt chỉ đụng dữ liệu riêng của chính LSX đó, không tranh chấp gì.

Sinh mã (`LSXxxxx`/`JOBxxxx`) nằm **trong** transaction, cấp qua `document_sequences` — atomic
(`INSERT … ON CONFLICT DO UPDATE … RETURNING`), hai lượt duyệt song song không thể ra cùng mã.

## Failure cases

| Tình huống | Mã | Kết quả |
| --- | --- | --- |
| LSX không tồn tại | `E081` | 404 |
| Đơn gốc đã xoá mềm | `E057` | 404 |
| LSX không còn `PENDING` (đã duyệt) | `E083` | 409 — duyệt hai lần bị chặn ở đây |
| Đơn gốc không còn `AWAITING_PRODUCTION` | `E076` | 409 |
| LSX không còn `PENDING` khi sửa SL | `E084` | 409 |
| `orderItemId` lạ | `E078` | 400, **không dòng nào được ghi** |

Rollback để lại trạng thái nhất quán: hoặc cả LSX+đơn+Job cùng đổi, hoặc không gì đổi.

## Business rules

- Vì sao Job gộp theo sản phẩm còn dòng quyết định sản xuất giữ 1-1 với dòng đơn →
  `docs/domains/production.md`.
- Vì sao `APPROVED` chưa có đường lùi → cùng file, mục Lifecycle.

## Related domains

`production` ↔ `orders` (đổi trạng thái hai chiều). Không đụng `inventory` ở bước này.

Bước trước: `docs/workflows/order-approval.md` · Bước sau:
`docs/workflows/production-job-execution.md`.

Code: `ProductionOrdersService.updateProductionOrder`/`approveProductionOrder`,
`ProductionJobsService.createJobs`.
