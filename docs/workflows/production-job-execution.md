# Thực thi Job

Chặng giữa của luồng sản xuất: xưởng bắt đầu làm, Giám đốc/Quản lý sản xuất duyệt công đoạn một lần
(`approve-operations`, thêm 2026-08-25), rồi mới đọc bảng vật tư gộp từ cây BOM snapshot lúc duyệt và
báo tiến độ hoàn thành/NG theo từng công đoạn. Job rời `IN_PROGRESS` ngay tại route `PATCH
operations` của luồng này (khi công đoạn Cấp 0 xong), rồi tiếp tục qua QC/nhập kho ở
`docs/workflows/final-qc.md` — vòng đời đầy đủ ở `docs/domains/production.md`.

`report`/`hold`/`resume` **ở mức Job** (báo sản lượng tổng, tạm dừng/làm tiếp) và route sửa vật tư
của Job vẫn chưa có — `production_job_issues` chỉ đọc qua `/bom`, không có route ghi nào khác (xem
`docs/domains/production.md`). Tiến độ **ở mức từng công đoạn** thì đã có, qua
`PATCH .../operations/:operationId` (xem dưới) — đừng nhầm hai mức này.

## Trigger

| Route | Ý nghĩa | Đổi trạng thái? |
| --- | --- | --- |
| `POST /production-jobs/:jobId/start` | Bắt đầu làm | Có (`production_jobs.status`); có thể kèm sinh đề xuất mua hàng |
| `POST /production-jobs/:jobId/approve-operations` | Duyệt công đoạn — mở khoá `PATCH operations` bên dưới | Không đổi `status`, ghi `operationsApprovedBy`/`operationsApprovedAt` |
| `GET /production-jobs/:jobId/bom` | Đọc nhu cầu vật tư của Job — `production_job_issues` join hai bảng chiều `production_job_items`/`production_job_units` (phân trang, `q` theo mã/tên vật tư). Không phải cây BOM | Không |
| `GET /production-jobs/:jobId/operations` | Đọc công đoạn as-used, nhóm theo part chứa nó, mỗi công đoạn kèm `plannedQuantity` — nguồn lấy `operationId` cho route dưới | Không |
| `PATCH /production-jobs/:jobId/operations/:operationId` | Nhập SL hoàn thành + SL không đạt (NG) cho một công đoạn | Có (`production_job_operations`) |
| `GET /production-jobs/:jobId/notes` | Đọc ghi chú | Không |
| `POST /production-jobs/:jobId/notes` | Đăng một ghi chú | Không |

## Actor

`start`/`PATCH operations`/`POST notes` dùng `production:update`; `approve-operations` dùng
`production:approve` (Giám đốc hoặc Quản lý sản xuất — cùng quyền duyệt LSX); ba route đọc còn lại
(`bom`/`operations`/`notes`) dùng `production:read`.

⚠️ Không role seed nào có `production:update`/`production:read` (xem
`docs/domains/identity-access.md`).

## Preconditions

- Job tồn tại (`E082`). Không kiểm LSX/đơn gốc — Job đứng độc lập sau khi sinh ra.
- `start`: trạng thái hiện tại phải là `PENDING`, nếu không: `E087`. **Thiếu vật tư không chặn** —
  xem Side effects.
- `approve-operations`: trạng thái hiện tại phải là `IN_PROGRESS`, nếu không: `E087`. Chưa duyệt lần
  nào (`operationsApprovedAt` còn null), nếu không: `E251`.
- `PATCH operations`: trạng thái hiện tại phải là `IN_PROGRESS`, nếu không: `E087` — chưa `start` thì
  chưa có gì để báo tiến độ. Đã qua `approve-operations` (`operationsApprovedAt` khác null), nếu
  không: `E250`. `operationId` phải tồn tại **và** thuộc đúng `jobId`, nếu không: `E091`.
  `completedQuantity + rejectedQuantity` gửi lên không được vượt `plannedQuantity` của node BOM cha,
  nếu không: `E252`.
- Các route còn lại (`bom`/`operations`/`notes`): không kiểm trạng thái — đọc/đăng được ở mọi trạng
  thái Job.

```
PENDING ──start──> IN_PROGRESS ──approve-operations──> (PATCH operations mở khoá)
   ──(PATCH operations, công đoạn Cấp 0 xong)──> WAITING_QC
```

(Tiếp theo `WAITING_QC → WAITING_DELIVERY → COMPLETED` nằm ngoài phạm vi luồng này, xem
`docs/workflows/final-qc.md`.)

## Flow

`start`: đọc Job → kiểm trạng thái → đọc `production_job_issues` của Job, gọi
`InventoryService.getMaterialStockLevels` (gộp mọi kho) để so `requiredQty` với `onHand`, giữ lại
phần thiếu (`> 0`) của từng vật tư — **đọc, chạy ngoài transaction** → **transaction**: `UPDATE`
(`status`, `startedBy`, `startedAt`); nếu có ít nhất một vật tư thiếu, gọi
`PurchaseRequestsService.createShortageRequest` ghi thêm một phiếu `purchase_requests` (`status`
mặc định `DRAFT`) + các dòng `purchase_request_items` cho đúng phần thiếu. Không thiếu gì thì
không tạo phiếu. Trả `204`, không có nội dung — không đọc lại chi tiết Job.

`approve-operations`: đọc Job (kiểm trạng thái `IN_PROGRESS`, `E251` nếu `operationsApprovedAt` đã
có) → một lệnh `UPDATE` (`operationsApprovedBy`, `operationsApprovedAt = now()`), không đụng
`status`. Trả `204`, không có nội dung.

`bom`: đọc `production_job_issues` join `production_job_items`/`production_job_units` (hai FK
`NOT NULL`) — `q` lọc trên `production_job_items.code`/`.name` qua `unaccentILike`, `LIMIT`/`OFFSET`
bình thường ở SQL. Không đụng cây BOM (`production_job_bom_items`), không tính toán gì thêm — trả
nguyên `requiredQty` đã tính sẵn lúc duyệt LSX.

`operations`: đọc `production_job_bom_items` kèm quan hệ `operations` (`with`, 1 lượt query — cột
`planned_quantity` đã có sẵn trên mỗi node, tính từ lúc duyệt LSX) → gắn `plannedQuantity` của node
xuống từng công đoạn của nó → lọc bỏ node không có công đoạn. Mảng thường, không phân trang.

`PATCH operations`: đọc Job (kiểm trạng thái, `E250` nếu `operationsApprovedAt` còn null) → tìm
`operationId` đúng phạm vi `jobId` (`E091` nếu không có), kèm luôn `plannedQuantity` của node BOM cha
(`productionJobBomItemId`) trong cùng lượt query (`with: { bomItem }`) → so
`completedQuantity + rejectedQuantity` gửi lên với số đó (`E252` nếu vượt) → trong 1 transaction:
`UPDATE` ghi đè cả `completedQuantity` lẫn `rejectedQuantity`, tự set `completedDate = now()` nếu
`completedQuantity >= plannedQuantity` (ngược lại về `null` — chỉ tính SL đạt, NG không tính) —
**nếu** đây là công đoạn Cấp 0 (`itemType = FG`) **và** `completedDate` vừa được set, ghi thêm
`productionJobs.status: IN_PROGRESS → WAITING_QC` (2026-08-24,
`docs/decisions/production-lifecycle-closing.md`) → đọc lại đúng công đoạn đó trả về. Không có input
nhận `completedDate` từ client.

`POST notes`: kiểm Job tồn tại → một lệnh `INSERT` (`content`, `createdBy`) → `204`, không trả nội
dung. `GET notes` đọc qua relational query API (`with: { creator: true }` — `createdBy` trỏ thẳng
`users.id`, một chặng, `docs/domains/identity-access.md`), sắp `createdAt` **tăng dần** (cũ trước,
mới sau) — đọc xuôi như một luồng trao đổi, khác `GET /production-orders/:id/logs` (đọc ngược lịch
sử).

## State changes

`production_jobs.status`: `PENDING → IN_PROGRESS` (`start`) — vẫn là hành động duy nhất đổi trạng
thái Job, và duy nhất ghi thêm dữ liệu vòng đời (`startedBy`/`startedAt`).

`production_jobs.operationsApprovedBy`/`operationsApprovedAt` (`approve-operations`) — không đổi
`status`, chỉ mở khoá `PATCH operations` (xem Preconditions).

`purchase_requests`/`purchase_request_items`: `start` **có thể** thêm một phiếu mới (`status =
DRAFT`) nếu Job thiếu vật tư — xem Side effects. Không phải đổi trạng thái, là tạo mới.

`production_job_operations.completedQuantity`/`rejectedQuantity`/`completedDate` (`PATCH operations`)
— chủ yếu là dữ liệu tiến độ trên một dòng công đoạn, `production_jobs.status` đứng yên **trừ** đúng
một trường hợp:
công đoạn Cấp 0 (`itemType = FG`) đạt `completedDate` thì cùng lệnh này đẩy luôn
`production_jobs.status: IN_PROGRESS → WAITING_QC` (2026-08-24) — `E210` đã đảm bảo mọi công đoạn
khác xong trước đó, xem `docs/decisions/production-lifecycle-closing.md`.

`PATCH operations` là route duy nhất trong luồng NÀY đổi trạng thái Job xa hơn `IN_PROGRESS`; các
bước tiếp theo (`WAITING_QC → WAITING_DELIVERY → COMPLETED`) thuộc `docs/workflows/final-qc.md`.

## Side effects

`start`: **có thể** sinh một đề xuất mua hàng — vật tư nào của Job có `requiredQty > onHand` (gộp
mọi kho) thì góp một dòng vào phiếu, số lượng dòng là đúng phần thiếu. Không thiếu vật tư nào →
không có side effect nào cả, giống các phiên bản trước. Thiếu vật tư **không chặn** `start` — Job
vẫn chuyển `IN_PROGRESS` dù có sinh phiếu hay không; đây không phải một điều kiện tiên quyết, chỉ là
hệ quả kèm theo. `start` vẫn **không** tiêu hao vật tư thật, không sinh phiếu xuất/nhập kho — sinh
đề xuất mua không đụng `inventory_balances`/`inventory_transactions`.

Mọi route còn lại (`bom`/`operations`/`notes`/`PATCH operations`): không có side effect nào ngoài
chính bảng chúng ghi.

- Không ghi log — Job cố ý không có action log tự động (`docs/domains/production.md`). `POST notes`
  chỉ thêm một dòng `production_job_notes`; `PATCH operations` chỉ sửa đúng dòng
  `production_job_operations` đó, cộng thêm đúng một side effect có điều kiện: đẩy
  `production_jobs.status` khi công đoạn Cấp 0 xong (xem State changes).
- Không đẩy trạng thái LSX/đơn hàng trực tiếp từ luồng này — LSX chỉ đóng sau, ở bước nhập kho thành
  phẩm (`docs/workflows/final-qc.md`).

## Transaction boundary

`POST notes` vẫn một `INSERT` đơn — không transaction, Postgres đã đảm bảo nguyên tử. Các route đọc
chỉ `SELECT`. `PATCH operations` từ 2026-08-24 **có transaction** (`db.transaction`) — `UPDATE
production_job_operations` + `UPDATE production_jobs` (điều kiện, chỉ khi công đoạn Cấp 0 vừa xong)
phải cùng đậu hoặc cùng rớt.

`start` giờ **có transaction**: đọc tồn kho (`getMaterialStockLevels`) chạy **trước, ngoài**
transaction — chỉ là input để tính phần thiếu, không phải điều kiện chặn nên không cần khoá gì.
Trong transaction: `UPDATE production_jobs` + (nếu có thiếu) `INSERT purchase_requests` +
`INSERT purchase_request_items`, bao đúng bằng `db.transaction`
(`.claude/rules/transactions.md`) — hoặc cả Job chuyển trạng thái lẫn phiếu cùng vào, hoặc không gì
cả.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Job không tồn tại | `E082` | 404 |
| `start` gọi khi Job không còn `PENDING` | `E087` | 409 |
| `approve-operations`/`PATCH operations` gọi khi Job chưa `IN_PROGRESS` | `E087` | 409 |
| `approve-operations` gọi lại khi Job đã duyệt công đoạn | `E251` | 409 |
| `PATCH operations` gọi khi Job chưa qua `approve-operations` | `E250` | 409 |
| `operationId` không tồn tại hoặc không thuộc `jobId` | `E091` | 404 |
| `completedQuantity + rejectedQuantity` vượt `plannedQuantity` của node BOM cha | `E252` | 400 |
| `start`: row `users` của người gọi không còn (token còn hạn nhưng user đã bị xoá mềm) | `E012` | 404 |

Không có mã lỗi riêng cho việc Job chuyển `WAITING_QC` — đây là side effect tự động, không có điều
kiện nào có thể fail độc lập với chính `PATCH operations` (đã qua hết `E091`/`E210`/`E252` trước đó).

## Business rules

- Vòng đời đầy đủ của Job (5 trạng thái từ 2026-08-24) và vì sao 3 trạng thái kết thúc tự động,
  không route tay → `docs/domains/production.md`, `docs/decisions/production-lifecycle-closing.md`.
- Cách tính `plannedQuantity` của `operations` (nhân luỹ kế theo cây, không phải SUM thô) → cùng
  file, mục Core concepts (bảng so sánh cây BOM/công đoạn/vật tư).
- Vì sao `unitQty`/`requiredQty` (vật tư, `GET .../bom`) không phải BOM explosion →
  `docs/domains/product-structure.md`.

## Related domains

Phần lớn `production` thuần — các route đọc chỉ đọc lại dữ liệu đã copy sẵn từ Product Structure lúc
duyệt LSX, không đọc `bom_operations`/`bom_items` sống; `PATCH operations` cũng chỉ sửa dữ liệu
snapshot của chính Job. Ngoại lệ là `start`: đọc `inventory` (`InventoryService.getMaterialStockLevels`,
chỉ đọc `inventory_balances`, không ghi) và **ghi** `purchase-requests`
(`PurchaseRequestsService.createShortageRequest`) — điểm ghi-ngang-domain duy nhất trong luồng này.

Bước trước: `docs/workflows/production-order-approval.md`. Bước sau (Job rời `WAITING_QC`):
`docs/workflows/final-qc.md`.

Code: `ProductionJobsService.startJob`/`collectMaterialShortages`/`resolveRequesterDepartment`/
`approveJobOperations`/`getProductionJobBom`/`getProductionJobOperations`/
`updateProductionJobOperation`/`getProductionJobNotes`/`createProductionJobNote`;
`PurchaseRequestsService.createShortageRequest`; `InventoryService.getMaterialStockLevels`.
