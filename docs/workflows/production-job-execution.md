# Thực thi Job

Chặng giữa của luồng sản xuất: xưởng bấm `start` — mốc **duy nhất** snapshot cây BOM/công đoạn/vật
tư của Job từ sản phẩm hiện tại (Job `PENDING` trước đó không có snapshot nào, xem
`docs/decisions/job-snapshot-at-start.md`) — rồi đọc bảng vật tư gộp từ cây BOM đó và báo tiến độ
hoàn thành/NG theo từng công đoạn — được ngay khi Job `IN_PROGRESS`, không
còn bước duyệt công đoạn riêng chặn giữa (`approve-operations` đã xoá 2026-09-03, xem Business
rules). Job rời `IN_PROGRESS` ngay tại route `POST .../reports` của luồng này (khi công đoạn Cấp 0
xong), rồi tiếp tục qua QC/nhập kho ở `docs/workflows/outgoing-qc.md` — vòng đời đầy đủ ở
`docs/domains/production.md`.

`report`/`hold`/`resume` **ở mức Job** (báo sản lượng tổng, tạm dừng/làm tiếp) và route sửa vật tư
của Job vẫn chưa có — `production_job_issues` chỉ đọc qua `/bom`, không có route ghi nào khác (xem
`docs/domains/production.md`). Tiến độ **ở mức từng công đoạn** thì đã có, qua đúng một đường:
`POST /production-execution/operations/:jobOperationId/reports` (báo cáo, cộng dồn — module
`production-execution`, xem mục "Route của `production-execution`" dưới) — đừng nhầm với mức Job
(`report`/`hold`/`resume` ở trên, vẫn chưa có route).

## Trigger

| Route | Ý nghĩa | Đổi trạng thái? |
| --- | --- | --- |
| `POST /production-jobs/:jobId/start` | Bắt đầu làm — dựng snapshot BOM/công đoạn/vật tư của Job lần đầu, mở khoá `POST .../reports` bên dưới ngay | Có (`production_jobs.status`); có thể kèm sinh đề xuất mua hàng |
| `GET /production-jobs/:jobId/bom` | Đọc nhu cầu vật tư của Job — `production_job_issues` join hai bảng chiều `production_job_items`/`production_job_units` (phân trang, `q` theo mã/tên vật tư). Không phải cây BOM; **rỗng nếu Job còn `PENDING`** (chưa `start`) | Không |
| `GET /production-jobs/:jobId/operations` | Đọc công đoạn as-used, nhóm theo part chứa nó, mỗi công đoạn kèm `plannedQuantity` — nguồn lấy `operationId` cho route dưới; **rỗng nếu Job còn `PENDING`** | Không |
| `GET /production-jobs/:jobId/notes` | Đọc ghi chú | Không |
| `POST /production-jobs/:jobId/notes` | Đăng một ghi chú | Không |
| `GET /production-jobs/:jobId/logs` | Đọc lịch sử thao tác — `production_job_logs`, `desc(createdAt)` | Không |
| `GET /production-execution/operations` | Thẻ chọn công đoạn (màn "Thực hiện sản xuất", bước 1) — một thẻ / công đoạn thật (`operations`), không lọc theo trạng thái Job | Không |
| `GET /production-execution/jobs` | Danh sách công việc của một công đoạn đang chọn (bước 2) — không lọc trạng thái Job, chỉ lọc theo bộ lọc người dùng chọn | Không |
| `POST /production-execution/operations/:jobOperationId/reports` | Lưu báo cáo hoàn thành **lần này** cho một Part (bước 3) — cộng dồn | Có (`production_job_operations`, cộng dồn) + thêm 1 dòng `production_job_operation_reports` |
| `PATCH /production-jobs/:jobId/operations/:jobOperationId/due-date` | Đặt/sửa hạn kế hoạch (`dueDate`) của một công đoạn — ghi đè thẳng, không cộng dồn, không phân biệt `OUTSOURCE` | Có (`production_job_operations.dueDate`, ghi đè) |

Bước 3 của màn "Thực hiện sản xuất" (danh sách Part của Job) đọc lại đúng
`GET /production-jobs/:jobId/operations` **có sẵn** ở trên (lọc phía FE theo `operationId` đang
chọn) — không có route riêng, tránh trùng nguồn dữ liệu.

## Actor

`start`/`POST notes`/`PATCH .../due-date` dùng `production:update`; bốn route đọc còn lại
(`bom`/`operations`/`notes`/`logs`) dùng `production:read`.

Hai route đọc của `production-execution` dùng `production:read`; `POST .../reports` dùng
`production:update` — cùng quyền, khác module, phục vụ đúng người dùng của `start` (tổ sản xuất),
không phải Giám đốc/Quản lý. Seed hiện cấp cả hai cho PRODUCTION (`credentials.seed.ts`).

## Preconditions

- Job tồn tại (`E082`). Không kiểm LSX/đơn gốc — Job đứng độc lập sau khi sinh ra.
- `start`: trạng thái hiện tại phải là `PENDING`, nếu không: `E087`. **Thiếu vật tư không chặn** —
  xem Side effects.
- Các route còn lại (`bom`/`operations`/`notes`): không kiểm trạng thái — đọc/đăng được ở mọi trạng
  thái Job.
- `GET /production-execution/operations`/`.../jobs`: **không** kiểm trạng thái Job — hiện mọi Job có
  ít nhất một công đoạn khớp bộ lọc, kể cả Job chưa `start` hay đã `COMPLETED` (tổ trưởng cần đối
  chiếu số cũ). `status` (nếu gửi) lọc đúng `production_jobs.status` người dùng chọn, không phải một
  gate cứng.
- `PATCH /production-jobs/:jobId/operations/:jobOperationId/due-date`: Job phải tồn tại (`E082`) và
  đang `IN_PROGRESS` (`E087`) — Job `PENDING` chưa có dòng công đoạn nào, Job đã qua `IN_PROGRESS`
  không còn sửa kế hoạch. `jobOperationId` phải tồn tại **và** thuộc đúng `jobId` trên URL, nếu
  không `E091`. Không phân biệt `OUTSOURCE` — hạn là kế hoạch điều độ, không phải số liệu OS-IN tự
  ghi.
- `POST /production-execution/operations/:jobOperationId/reports`: `jobOperationId` phải tồn tại
  (`E091`); công đoạn `OUTSOURCE` bị chặn hẳn (`E260` — chỉ OS-IN mới được ghi số của nó). Job chứa
  nó phải `IN_PROGRESS` (`E087`) — chưa `start` thì chưa có gì để báo tiến độ. Node Cấp 0
  (`itemType = FG`) chặn `E210` nếu còn part khác chưa `completedDate` (bước Lắp ráp chỉ mở khi mọi
  part khác đã xong). `(đã đạt + đạt lần này)` không được vượt `plannedQuantity` (`E256`, so **sau
  khi cộng dồn** riêng SL đạt) — SL NG cộng dồn không bị giới hạn theo số đó. Không chặn báo cáo
  "rỗng" — `completedQuantityDelta = 0` kèm chỉ ghi chú/ảnh là hợp lệ. Thứ tự kiểm đầy đủ: `E091` →
  `E260` → `E087` → `E210` (riêng Cấp 0) → `E256`.

```
PENDING ──start──> IN_PROGRESS (POST .../reports mở khoá ngay)
   ──(POST .../reports, công đoạn Cấp 0 xong)──> WAITING_QC
```

(Tiếp theo `WAITING_QC → WAITING_DELIVERY → COMPLETED` nằm ngoài phạm vi luồng này, xem
`docs/workflows/outgoing-qc.md`.)

## Flow

`start`: **transaction** — khoá Job (`SELECT ... FOR UPDATE`) → kiểm trạng thái `PENDING` (`E087`)
→ `createJobSnapshot` (`production-job-snapshot.query.ts`) dựng snapshot **lần đầu và duy nhất**:
nhân bản cây BOM sang `production_job_bom_items`, copy routing as-used sang
`production_job_operations`, gộp nhu cầu CONSUMABLE sang `production_job_issues` — từ đúng BOM/công
đoạn của sản phẩm tại thời điểm bấm `start` → đọc `production_job_issues` vừa ghi, gọi
`InventoryService.getConsumableStockLevels` (gộp mọi kho, cùng `tx`) để so `requiredQty` với
`onHand`, giữ lại phần thiếu (`> 0`) của từng vật tư → `UPDATE` (`status`, `startedBy`,
`startedAt`) → ghi 1 dòng `production_job_logs STARTED`; nếu có ít nhất một vật tư thiếu, gọi
`PurchaseRequestsService.createShortageRequest` ghi thêm một phiếu `purchase_requests` (`status`
mặc định `DRAFT`) + các dòng `purchase_request_items` cho đúng phần thiếu. Không thiếu gì thì
không tạo phiếu. Trả `204`, không có nội dung — không đọc lại chi tiết Job.

`bom`: đọc `production_job_issues` join `production_job_items`/`production_job_units` (hai FK
`NOT NULL`) — `q` lọc trên `production_job_items.code`/`.name` qua `unaccentILike`, `LIMIT`/`OFFSET`
bình thường ở SQL. Không đụng cây BOM (`production_job_bom_items`), không tính toán gì thêm — trả
nguyên `requiredQty` đã có sẵn trên snapshot. **Job còn `PENDING` trả mảng rỗng** (chưa `start` thì
chưa có snapshot) — FE dùng `GET /items/:itemId/bom` để xem cấu trúc sản phẩm lúc đó.

`operations`: đọc `production_job_bom_items` kèm quan hệ `operations` (`with`, 1 lượt query — cột
`planned_quantity` đã có sẵn trên mỗi node) → gắn `plannedQuantity` của node xuống từng công đoạn
của nó → lọc bỏ node không có công đoạn. Mảng thường, không phân trang. **Job còn `PENDING` trả mảng
rỗng** — cùng lý do trên, FE dùng `GET /items/:itemId/bom/items/:bomItemId/operations`.

`POST notes`: kiểm Job tồn tại → một lệnh `INSERT` (`content`, `createdBy`) → `204`, không trả nội
dung. `GET notes` đọc qua relational query API (`with: { creatorBy: true }` — `createdBy` trỏ thẳng
`users.id`, một chặng, `docs/domains/identity-access.md`), sắp `createdAt` **tăng dần** (cũ trước,
mới sau) — đọc xuôi như một luồng trao đổi, khác `GET logs` (đọc ngược lịch sử, xem dưới).

`GET logs`: kiểm Job tồn tại (`ensureJobExists`, `E082`) → đọc `production_job_logs` kèm
`performerBy` (`with`), sắp `createdAt` **giảm dần** (mới nhất trước) — cùng chiều
`GET /production-orders/:id/logs`. `production_job_logs` tự ghi tại 5 điểm chuyển trạng thái của
Job (xem State changes/Side effects dưới và `docs/decisions/production-lifecycle-closing.md`),
không có route ghi tay nào.

`PATCH .../due-date`: kiểm Job tồn tại (`ensureJobExists`, `E082`) → kiểm trạng thái `IN_PROGRESS`
(`E087`) → một lệnh `UPDATE production_job_operations SET due_date = ...` khoá thêm điều kiện
`production_job_id = :jobId` (`.returning()` rỗng → `E091`) → `204`, không trả nội dung. Không
transaction (một câu update một cột, không đọc-rồi-ghi), không ghi `production_job_logs`.

### Route của `production-execution`

`GET operations`: join `operations` (master) ⋈ `production_job_operations` ⋈ `production_jobs` ⋈
`production_orders` ⋈ `orders` ⋈ `items`, `GROUP BY operations.id` — một thẻ / một dòng
`operations` thật (không gộp theo `type`; nếu thực tế chỉ có một dòng `OUTSOURCE`, mockup tự nhiên
hiện đúng một thẻ, không cần logic gộp riêng). `jobCount = COUNT(DISTINCT production_jobs.id)` khớp
bộ lọc hiện tại (`q`/`status`/`clientId`/`startDate`/`endDate`, không bắt buộc filter nào, không gate
trạng thái Job). Mảng thường, không phân trang, sắp theo `code`.

`GET jobs`: `.select()` + join Job → LSX → đơn hàng → item (đúng khuôn
`ProductionJobsService.getProductionJobs`), lọc bắt buộc `operationId` (UUID thật của `operations`,
so trực tiếp `production_job_operations.operationId`) + cùng bộ lọc `q`/`status`/`clientId`/
`startDate`/`endDate` của `GET operations`. Mỗi Job gắn `plannedQuantity`/`completedQuantity`/
`rejectedQuantity` — `SUM` qua mọi dòng `production_job_operations` (join `production_job_bom_items`
để lấy `plannedQuantity` từng node) khớp `(jobId, operationId)` — và `operationStatus`/
`operationCompletedDate` suy từ `COUNT`/`MAX` trên cùng tập dòng đó (`DONE` khi mọi dòng đã
`completedDate`, `IN_PROGRESS` khi tổng `completedQuantity > 0`, còn lại `NOT_STARTED`). Đếm tổng
bằng `COUNT(DISTINCT production_jobs.id)` cùng `WHERE`, chạy song song `Promise.all` với dòng dữ
liệu.

`POST operations/:jobOperationId/reports`: đọc operation kèm `bomItem` + `productionJob` (`E091` nếu
không có) → chặn hẳn công đoạn `OUTSOURCE` (`E260`, chỉ OS-IN mới được ghi số của nó) → kiểm `E087`
→ nếu node Cấp 0, đếm công đoạn non-FG chưa `completedDate` (`E210` nếu còn) →
`FilesService.linkFiles(imageFileIds)` nếu có, **ngoài** transaction → **transaction**:
khoá operation (`SELECT ... FOR UPDATE`) → so riêng `completedQuantity` sau khi cộng dồn
`completedQuantityDelta` với `plannedQuantity` (`E256` — `rejectedQuantityDelta` cộng dồn không
giới hạn theo số đó) → `INSERT production_job_operation_reports` +
`INSERT production_job_operation_report_files` (0..N ảnh) → `UPDATE production_job_operations`
(cộng dồn `completedQuantity`/`rejectedQuantity`, `completedDate = reqDto.completedDate` khi tổng
đạt ≥ `plannedQuantity`, ngược lại `null`) → nếu node Cấp 0 và không còn công đoạn FG nào dở (đếm lại
toàn bộ **trong `tx`**, không suy từ riêng công đoạn vừa báo) thì `UPDATE production_jobs SET status
= WAITING_QC`. Trả
`204`, không đọc lại. Bảng `production_job_operation_reports` là nhật ký nội bộ — chưa có route đọc
lịch sử, chỉ để truy vết sau này.

## State changes

`production_jobs.status`: `PENDING → IN_PROGRESS` (`start`) — vẫn là hành động duy nhất đổi trạng
thái Job, và duy nhất ghi thêm dữ liệu vòng đời (`startedBy`/`startedAt`); cũng là hành động duy
nhất mở khoá `POST .../reports` (xem Preconditions) — không còn bước duyệt công đoạn riêng. Cùng
transaction: `createJobSnapshot` ghi lần đầu (và duy nhất) 3 bảng
`production_job_bom_items`/`production_job_operations`/`production_job_issues`
(`docs/decisions/job-snapshot-at-start.md`), rồi ghi thêm 1 dòng `production_job_logs` (`STARTED`).

`purchase_requests`/`purchase_request_items`: `start` **có thể** thêm một phiếu mới (`status =
DRAFT`) nếu Job thiếu vật tư — xem Side effects. Không phải đổi trạng thái, là tạo mới.

`production_job_operations.completedQuantity`/`rejectedQuantity`/`completedDate` (`POST
.../reports`) — **cộng dồn**, không ghi đè; cộng thêm một dòng mới `production_job_operation_reports`
(append-only, không có route sửa/xoá) + 0..N dòng `production_job_operation_report_files` (ảnh đính
kèm lần báo cáo đó). Chủ yếu là dữ liệu tiến độ trên một dòng công đoạn, `production_jobs.status`
đứng yên **trừ** đúng một trường hợp: công đoạn Cấp 0 (`itemType = FG`) đạt `completedDate` thì cùng
lượt ghi này đẩy luôn `production_jobs.status: IN_PROGRESS → WAITING_QC` — `E210` đã đảm bảo mọi
công đoạn khác xong trước đó, xem `docs/decisions/production-lifecycle-closing.md`. Đúng lúc đó (chỉ
khi UPDATE thực sự đổi trạng thái — `closeJobIfFinalAssemblyDone` tự guard bằng `.returning()`), ghi
thêm 1 dòng `production_job_logs` (`WAITING_QC`, `performedBy = NULL` — mốc tự động, xem
`docs/decisions/production-lifecycle-closing.md`).

`POST .../reports` là route duy nhất trong luồng NÀY đổi trạng thái Job xa hơn `IN_PROGRESS`; các
bước tiếp theo (`WAITING_QC → WAITING_DELIVERY → COMPLETED`) thuộc `docs/workflows/outgoing-qc.md`.

## Side effects

`start`: **có thể** sinh một đề xuất mua hàng — vật tư nào của Job có `requiredQty > onHand` (gộp
mọi kho) thì góp một dòng vào phiếu, số lượng dòng là đúng phần thiếu. Không thiếu vật tư nào →
không có side effect nào cả, giống các phiên bản trước. Thiếu vật tư **không chặn** `start` — Job
vẫn chuyển `IN_PROGRESS` dù có sinh phiếu hay không; đây không phải một điều kiện tiên quyết, chỉ là
hệ quả kèm theo. `start` vẫn **không** tiêu hao vật tư thật, không sinh phiếu xuất/nhập kho — sinh
đề xuất mua không đụng `inventory_balances`/`inventory_transactions`.

Mọi route còn lại (`bom`/`operations`/`notes`): không có side effect nào ngoài chính bảng chúng ghi.

- `POST notes` chỉ thêm một dòng `production_job_notes`, không ghi `production_job_logs`. `POST
  .../reports` chỉ sửa đúng dòng `production_job_operations` đó, cộng thêm đúng một side effect có
  điều kiện: đẩy `production_jobs.status` khi công đoạn Cấp 0 xong, kèm 1 dòng
  `production_job_logs` (xem State changes).
- Không đẩy trạng thái LSX/đơn hàng trực tiếp từ luồng này — LSX chỉ đóng sau, ở bước nhập kho thành
  phẩm (`docs/workflows/outgoing-qc.md`).

## Transaction boundary

`POST notes` vẫn một `INSERT` đơn — không transaction, Postgres đã đảm bảo nguyên tử. Các route đọc
chỉ `SELECT`. `POST .../reports` **có transaction** (`db.transaction`) — khoá operation
(`SELECT ... FOR UPDATE`), `INSERT production_job_operation_reports` + `INSERT
production_job_operation_report_files`, `UPDATE production_job_operations`, và `UPDATE
production_jobs` (điều kiện, chỉ khi công đoạn Cấp 0 vừa xong) phải cùng đậu hoặc cùng rớt.

`start` **có transaction** bao trọn từ đầu: khoá Job (`SELECT ... FOR UPDATE`, chặn 2 lượt `start`
song song) → `createJobSnapshot` (`INSERT` cả ba bảng snapshot) → đọc `production_job_issues` vừa
ghi + `getConsumableStockLevels` (cùng `tx`) → `UPDATE production_jobs` + (nếu có thiếu)
`INSERT purchase_requests` + `INSERT purchase_request_items`, bao đúng bằng `db.transaction`
(`.claude/rules/transactions.md`) — hoặc snapshot + Job chuyển trạng thái + phiếu đề xuất cùng vào,
hoặc không gì cả.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Job không tồn tại | `E082` | 404 |
| `start` gọi khi Job không còn `PENDING` | `E087` | 409 |
| `POST .../reports` gọi khi Job chưa `IN_PROGRESS` | `E087` | 409 |
| `PATCH .../due-date` gọi khi Job chưa/không còn `IN_PROGRESS` | `E087` | 409 |
| `jobOperationId` không tồn tại (hoặc không thuộc `jobId` trên URL, `PATCH .../due-date`) | `E091` | 404 |
| `POST .../reports` trên công đoạn `OUTSOURCE` (chỉ OS-IN mới ghi được) | `E260` | 409 |
| `POST .../reports` trên công đoạn Cấp 0 khi còn part khác chưa `completedDate` | `E210` | 400 |
| `completedQuantity` (sau cộng dồn) vượt `plannedQuantity` của node BOM cha (`rejectedQuantity` không giới hạn) | `E256` | 400 |
| `start`: row `users` của người gọi không còn (token còn hạn nhưng user đã bị xoá mềm) — `UsersService.getUserDepartmentId` | `E012` | 404 |

Không có mã lỗi riêng cho việc Job chuyển `WAITING_QC` — đây là side effect tự động, không có điều
kiện nào có thể fail độc lập với chính `POST .../reports` (đã qua hết `E091`/`E260`/`E087`/`E210`/
`E256` trước đó).

## Business rules

- `POST .../approve-operations` (duyệt công đoạn riêng, quyền `production:approve`) đã xoá
  2026-09-03 — gộp về một bước duy nhất: `start` (`IN_PROGRESS`) là báo tiến độ được ngay, không
  còn gate trung gian. Cột `operationsApprovedBy`/`operationsApprovedAt` trên `production_jobs`
  vẫn còn (giữ cho dữ liệu cũ), chỉ không còn route nào ghi; `E250`/`E251` nghỉ hưu cùng đợt
  (`error-code.constant.ts`).
- Vòng đời đầy đủ của Job (5 trạng thái) và vì sao 3 trạng thái kết thúc tự động, không route tay →
  `docs/domains/production.md`, `docs/decisions/production-lifecycle-closing.md`.
- Cách tính `plannedQuantity` của `operations` và `unitQty`/`requiredQty` của vật tư (đều nhân luỹ
  kế theo cây, không phải SUM thô) → "Chuẩn nổ cấp BOM", `docs/domains/product-structure.md`.

## Related domains

Phần lớn `production` thuần — `bom`/`operations` chỉ đọc lại snapshot của chính Job (rỗng nếu còn
`PENDING`); `POST .../reports` cũng chỉ sửa dữ liệu snapshot của chính Job. `start` chạm hai domain
khác trong cùng transaction: đọc `product-structure` (gián tiếp qua `createJobSnapshot` — cây
`bom_items`/`bom_operations` sống của sản phẩm, xem `docs/decisions/job-snapshot-at-start.md`), đọc
`inventory` (`InventoryService.getConsumableStockLevels`, chỉ đọc `inventory_balances`, không ghi)
và **ghi** `purchase-requests` (`PurchaseRequestsService.createShortageRequest`).

Bước trước: `docs/workflows/production-order-approval.md`. Bước sau (Job rời `WAITING_QC`):
`docs/workflows/outgoing-qc.md`.

Code: `ProductionJobsService.startJob`/`getProductionJobForUpdate`/`collectJobIssueShortages`/
`getProductionJobBom`/`getProductionJobOperations`/`getProductionJobNotes`/
`createProductionJobNote`/`getProductionJobLogs`;
`production-jobs/production-job-snapshot.query.ts` (`createJobSnapshot`);
`ProductionExecutionService.getOperations`/`getJobs`/`createJobOperationReport`;
`UsersService.getUserDepartmentId`; `PurchaseRequestsService.createShortageRequest`;
`InventoryService.getConsumableStockLevels`.
