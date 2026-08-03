# Thực thi Job

Chặng cuối của luồng sản xuất: xưởng bắt đầu làm, đọc công đoạn/vật tư đã snapshot lúc duyệt, và báo
tiến độ hoàn thành theo từng công đoạn. Vòng đời hai trạng thái và lý do không có điểm kết thúc ở
`docs/domains/production.md`.

`report`/`hold`/`resume` **ở mức Job** (báo sản lượng tổng, tạm dừng/làm tiếp) và route sửa vật tư
của Job vẫn chưa có — tạm hoãn để mở rộng sau này. Tiến độ **ở mức từng công đoạn** thì đã có, qua
`PATCH .../operations/:operationId` (xem dưới) — đừng nhầm hai mức này.

## Trigger

| Route | Ý nghĩa | Đổi trạng thái? |
| --- | --- | --- |
| `POST /production-jobs/:jobId/start` | Bắt đầu làm | Có (`production_jobs.status`) |
| `GET /production-jobs/:jobId/bom` | Đọc cây BOM + công đoạn as-used đã snapshot, kèm `plannedQuantity`/`completedQuantity`/`completedDate` | Không |
| `PATCH /production-jobs/:jobId/operations/:operationId` | Nhập SL hoàn thành cho một công đoạn | Có (`production_job_operations`) |
| `GET /production-jobs/:jobId/materials` | Đọc danh sách vật tư | Không |
| `GET /production-jobs/:jobId/notes` | Đọc ghi chú | Không |
| `POST /production-jobs/:jobId/notes` | Đăng một ghi chú | Không |

## Actor

`start`/`PATCH operations`/`POST notes` dùng `production:update`; bốn route đọc dùng
`production:read`.

⚠️ Không role seed nào có `production:update`/`production:read` (xem
`docs/domains/identity-access.md`).

## Preconditions

- Job tồn tại (`E082`). Không kiểm LSX/đơn gốc — Job đứng độc lập sau khi sinh ra.
- `start`: trạng thái hiện tại phải là `PENDING`, nếu không: `E087`.
- `PATCH operations`: trạng thái hiện tại phải là `IN_PROGRESS`, nếu không: `E087` — chưa `start` thì
  chưa có gì để báo tiến độ. `operationId` phải tồn tại **và** thuộc đúng `jobId`, nếu không: `E091`.
  `completedQuantity` gửi lên không được vượt `plannedQuantity` của node BOM cha, nếu không: `E088`.
- Các route còn lại (`bom`/`materials`/`notes`): không kiểm trạng thái — đọc/đăng được ở mọi trạng
  thái Job.

```
PENDING ──start──> IN_PROGRESS
```

## Flow

`start`: đọc Job → kiểm trạng thái → một lệnh `UPDATE` (`status`, `startedBy`, `startedAt`) → đọc
lại chi tiết trả về.

`bom`: đọc `production_job_bom_items` (kèm `operations`) đã copy sẵn từ Product Structure lúc duyệt
LSX — không đọc `routing_steps`/`bom_items` sống. Tính `plannedQuantity` cho từng node ngay trong
service (`ProductionJobsService.resolvePlannedQuantities`) bằng cách nhân luỹ kế `quantity` (định
mức trên 1 đơn vị cha) từ gốc xuống, nhân với SL Job — không lưu cột, không đọc lại `bom_items`.

`materials`: đọc lại dữ liệu đã copy sẵn, không tính toán lại.

`PATCH operations`: đọc Job (lấy SL Job + trạng thái) → kiểm trạng thái → tìm `operationId` đúng
phạm vi `jobId` (`E091` nếu không có) → tải toàn bộ node BOM của Job, tính lại `plannedQuantity` của
đúng node cha (`productionJobBomItemId`) → so `completedQuantity` gửi lên với số đó (`E088` nếu vượt)
→ một lệnh `UPDATE` ghi đè `completedQuantity`, và tự set `completedDate = now()` nếu
`completedQuantity >= plannedQuantity`, ngược lại tự đưa `completedDate` về `null` → đọc lại đúng
công đoạn đó trả về. Không có input nhận `completedDate` từ client.

`POST notes`: kiểm Job tồn tại → một lệnh `INSERT` (`content`, `createdBy`) → `204`, không trả nội
dung. `GET notes` đọc qua relational query API (`with: { creator: true }` — `createdBy` trỏ thẳng
`users.id`, một chặng, `docs/domains/identity-access.md`), sắp `createdAt` **tăng dần** (cũ trước,
mới sau) — đọc xuôi như một luồng trao đổi, khác `GET /production-orders/:id/logs` (đọc ngược lịch
sử).

## State changes

`production_jobs.status`: `PENDING → IN_PROGRESS` (`start`) — vẫn là hành động duy nhất đổi trạng
thái Job, và duy nhất ghi thêm dữ liệu vòng đời (`startedBy`/`startedAt`).

`production_job_operations.completedQuantity`/`completedDate` (`PATCH operations`) — **không** phải
đổi trạng thái Job, chỉ là dữ liệu tiến độ trên một dòng công đoạn; `production_jobs.status` đứng
yên.

Không có route nào khác đổi trạng thái Job — `IN_PROGRESS` là điểm dừng vĩnh viễn qua API.

## Side effects

**Không có**, cho mọi route kể cả `POST notes`/`PATCH operations`:

- Không tiêu hao vật tư thật, không sinh phiếu xuất/nhập kho.
- Không ghi log — Job cố ý không có action log tự động (`docs/domains/production.md`). `POST notes`
  chỉ thêm một dòng `production_job_notes`; `PATCH operations` chỉ sửa đúng dòng
  `production_job_operations` đó, không suy ra hay ghi thêm gì khác.
- Không đẩy trạng thái LSX, đơn hàng, hay chính Job (`PATCH operations` không chạm `production_jobs`).

## Transaction boundary

**Không có transaction nào** — `start` và `PATCH operations` đều là một `UPDATE` đơn (đọc trước để
validate, không cần transaction vì chỉ một bảng bị ghi), `POST notes` là một `INSERT` đơn, Postgres
đã đảm bảo nguyên tử. Các route đọc chỉ `SELECT`.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Job không tồn tại | `E082` | 404 |
| `start` gọi khi Job không còn `PENDING` | `E087` | 409 |
| `PATCH operations` gọi khi Job chưa `IN_PROGRESS` | `E087` | 409 |
| `operationId` không tồn tại hoặc không thuộc `jobId` | `E091` | 404 |
| `completedQuantity` vượt `plannedQuantity` của node BOM cha | `E088` | 400 |

Không có mã lỗi nào cho "Job đã xong" **ở mức tổng** — khái niệm đó không tồn tại; tiến độ chỉ có ở
mức từng công đoạn.

## Business rules

- Vì sao Job chỉ còn 2 trạng thái và không có cách nào biết "đã xong" ở mức tổng qua API →
  `docs/domains/production.md`.
- Cách tính `plannedQuantity` (nhân luỹ kế theo cây, không phải SUM thô) và vì sao an toàn tính lại
  lúc đọc → cùng file, mục Core concepts (bảng so sánh cây BOM/công đoạn/vật tư).
- Vì sao `unitQty`/`requiredQty` (vật tư) không phải BOM explosion, khác `plannedQuantity` (công
  đoạn) → `docs/domains/product-structure.md`.

## Related domains

`production` thuần — các route đọc chỉ đọc lại dữ liệu đã copy sẵn từ Product Structure lúc duyệt
LSX, không đọc `routing_steps`/`bom_items` sống; `PATCH operations` cũng chỉ sửa dữ liệu snapshot của
chính Job. Không đọc và không ghi sang domain nào khác — kể cả `inventory`.

Bước trước: `docs/workflows/production-order-approval.md`.

Code: `ProductionJobsService.startJob`/`getProductionJobBom`/`updateProductionJobOperation`/
`resolvePlannedQuantities`/`getProductionJobMaterials`/`getProductionJobNotes`/
`createProductionJobNote`.
