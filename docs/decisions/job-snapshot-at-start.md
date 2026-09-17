# Mốc đóng băng snapshot Job dời từ duyệt LSX sang "Xác nhận sản xuất"

**Trạng thái:** còn hiệu lực.

## Bối cảnh

Trước quyết định này, `ProductionJobsService.createJobs` (gọi từ transaction duyệt LSX,
`ProductionOrdersService.approveProductionOrder`) nhân bản cây BOM + công đoạn as-used + nhu cầu
vật tư sang `production_job_bom_items`/`production_job_operations`/`production_job_issues` **ngay
lúc duyệt LSX**. Kể từ đó snapshot đóng băng tuyệt đối.

Hệ quả: sửa BOM, thêm/bớt công đoạn Cấp 0, hay đổi định mức của sản phẩm **sau khi LSX đã duyệt
nhưng trước khi xưởng bấm "Xác nhận sản xuất"** hoàn toàn không phản ánh vào Job — hai tab "Nhu cầu
vật tư"/"Công đoạn sản xuất" của Job đó chạy theo dữ liệu tại đúng thời điểm duyệt LSX, có thể đã
lỗi thời hàng ngày hoặc hàng tuần tính đến lúc xưởng thật sự bắt tay vào làm.

## Quyết định

**Job `PENDING` không có snapshot nào cả** — `production_job_bom_items`/`production_job_operations`/
`production_job_issues` không có dòng nào cho tới khi Job `start`. `createJobs` (transaction duyệt
LSX) giờ chỉ sinh header `production_jobs` (`PENDING`) + log `CREATED`, không đụng ba bảng snapshot.

`ProductionJobsService.startJob` là nơi **duy nhất** gọi `createJobSnapshot`
(`production-jobs/production-job-snapshot.query.ts`) — dựng cây BOM + routing Cấp 0 + nhu cầu vật
tư từ master data hiện tại **đúng một lần**, ngay trong transaction chuyển `PENDING → IN_PROGRESS`,
trước khi tính vật tư thiếu. Không xoá gì trước khi ghi (chưa từng có gì để xoá), không diff, không
log riêng cho việc snapshot — chỉ một bước `INSERT` thêm vào transaction `start` sẵn có.

Muốn xem cấu trúc/công đoạn của sản phẩm trong lúc Job còn `PENDING`, gọi thẳng API master data sẵn
có — `GET /items/:itemId/bom` (cây BOM) và `GET /items/:itemId/bom/items/:bomItemId/operations`
(công đoạn từng node). Không route nào của `production-jobs` cần đổi để hỗ trợ việc này:
`GET /production-jobs/:jobId/bom`/`.../operations` vốn đã trả mảng rỗng một cách tự nhiên khi bảng
snapshot chưa có dòng nào cho Job đó — FE chỉ cần biết gọi API nào khi Job còn `PENDING`.

## Vì sao không "bám theo" (đã cân nhắc và bỏ)

Một phương án trung gian đã cân nhắc: vẫn snapshot lúc duyệt LSX, nhưng chừng nào Job còn `PENDING`
thì snapshot **bám theo** master data — mọi lượt ghi vào `boms`/`bom_operations` dựng lại snapshot
của Job liên quan. Bỏ phương án này vì nó phức tạp hơn nhiều lần cho cùng một kết quả cuối: Job vẫn
chỉ dùng dữ liệu chốt tại thời điểm `start`. "Snapshot chỉ tại `start`" đạt đúng mục tiêu (Job không
chạy theo dữ liệu lỗi thời) mà không cần thêm điểm móc vào `boms`/`bom-operations`, không cần cơ chế
diff/log riêng, không thêm bảng/cột nào.

## Hệ quả đã chấp nhận

So với hành vi gốc của repo (trước cả hai phương án trên): trước đây `production_job_issues` được
ghi ngay lúc duyệt LSX, nên **lãnh vật tư cho một Job còn `PENDING` là làm được** — không route nào
chặn theo `production_jobs.status`. Với quyết định này, `production_job_issues` không tồn tại cho
tới khi `start`, nên `InventoryRequisitionsService.validateRequisitionLines` sẽ luôn ném `E230` khi
ai đó cố lãnh vật tư cho một Job chưa `start` (bộ đếm nhu cầu rỗng). Nói cách khác: **lãnh vật tư
giờ đòi Job phải `IN_PROGRESS`** — hệ quả tự nhiên của việc Job `PENDING` không còn dữ liệu gì để
làm việc cùng, không phải lỗi.

## Đừng hoàn lại

Đừng quay về "snapshot đóng băng ngay lúc duyệt LSX" — đó chính xác là hành vi gây ra khiếu nại: Job
chạy theo BOM lỗi thời hàng ngày/hàng tuần. Cũng đừng thêm cơ chế "bám theo" (móc vào
`boms`/`bom-operations`, dựng lại + diff + log mỗi lượt sửa) — đã cân nhắc, phức tạp không tương
xứng với lợi ích so với "chỉ snapshot tại `start`" (xem mục trên).

## Related docs

- `docs/domains/production.md` — vòng đời Job, mốc snapshot.
- `docs/workflows/production-order-approval.md` — bước duyệt LSX giờ không đụng snapshot.
- `docs/workflows/production-job-execution.md` — `start` là nơi duy nhất dựng snapshot.
- `docs/decisions/bom-explosion-in-job-demand.md` — vì sao nổ cấp BOM được tính một lần, ghi kết
  quả, không tính lại bằng SQL đệ quy mỗi lượt đọc.
