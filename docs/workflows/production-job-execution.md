# Thực thi Job

Chặng cuối của luồng sản xuất: xưởng bắt đầu làm, và đọc công đoạn/vật tư đã snapshot lúc duyệt.
Vòng đời hai trạng thái và lý do không có điểm kết thúc ở `docs/domains/production.md`.

`report`/`hold`/`resume` (báo sản lượng, tạm dừng/làm tiếp) và route sửa vật tư của Job đã bỏ —
xưởng hiện chưa cần theo dõi sản lượng hay tạm dừng qua API, tạm hoãn để mở rộng sau này.

## Trigger

| Route | Ý nghĩa | Đổi trạng thái? |
| --- | --- | --- |
| `POST /production-jobs/:jobId/start` | Bắt đầu làm | Có |
| `GET /production-jobs/:jobId/steps` | Đọc công đoạn đã snapshot | Không |
| `GET /production-jobs/:jobId/materials` | Đọc danh sách vật tư | Không |

## Actor

`start` dùng `production:update`; hai route đọc dùng `production:read`.

⚠️ Không role seed nào có `production:update`/`production:read` (xem
`docs/domains/identity-access.md`).

## Preconditions

- Job tồn tại (`E082`). Không kiểm LSX/đơn gốc — Job đứng độc lập sau khi sinh ra.
- `start`: trạng thái hiện tại phải là `PENDING`, nếu không: `E087`.
- Hai route đọc (`steps`/`materials`): không kiểm trạng thái — đọc được ở mọi trạng thái Job.

```
PENDING ──start──> IN_PROGRESS
```

## Flow

`start`: đọc Job → kiểm trạng thái → một lệnh `UPDATE` (`status`, `startedBy`, `startedAt`) → đọc
lại chi tiết trả về.

`steps`/`materials`: đọc lại dữ liệu đã copy sẵn từ Product Structure lúc duyệt LSX — không tính
toán lại, không đọc `routing_steps`/`bom_items` sống.

## State changes

`production_jobs.status`: `PENDING → IN_PROGRESS`. `start` là hành động duy nhất còn lại của module
này, và cũng là hành động duy nhất ghi thêm dữ liệu vòng đời (`startedBy`/`startedAt`).

Không có route nào khác đổi trạng thái Job — `IN_PROGRESS` là điểm dừng vĩnh viễn qua API.

## Side effects

**Không có**, cho cả ba route:

- Không tiêu hao vật tư thật, không sinh phiếu xuất/nhập kho.
- Không ghi log — Job cố ý không có action log (`docs/domains/production.md`).
- Không đẩy trạng thái LSX hay đơn hàng.

## Transaction boundary

**Không có transaction nào** — `start` là một `UPDATE` đơn, Postgres đã đảm bảo nguyên tử. Hai
route đọc chỉ `SELECT`.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Job không tồn tại | `E082` | 404 |
| `start` gọi khi Job không còn `PENDING` | `E087` | 409 |

Không có mã lỗi nào cho "Job đã xong" — khái niệm đó không tồn tại.

## Business rules

- Vì sao Job chỉ còn 2 trạng thái và không có cách nào biết "đã xong" qua API →
  `docs/domains/production.md`.
- Vì sao Job vẫn không chia tiến độ theo công đoạn dù đã có snapshot routing → cùng file, mục Core
  concepts (bảng so sánh công đoạn/vật tư).
- Vì sao `unitQty` không phải BOM explosion → `docs/domains/product-structure.md`.

## Related domains

`production` thuần — hai route đọc chỉ đọc lại dữ liệu đã copy sẵn từ Product Structure lúc duyệt
LSX, không đọc `routing_steps`/`bom_items` sống. Không đọc và không ghi sang domain nào khác — kể cả
`inventory`.

Bước trước: `docs/workflows/production-order-approval.md`.

Code: `ProductionJobsService.startJob`/`getProductionJobSteps`/`getProductionJobMaterials`.
