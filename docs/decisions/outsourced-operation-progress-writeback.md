# OS-IN ghi ngược tiến độ công đoạn `OUTSOURCE` + siết gate `WAITING_DELIVERY`

**Trạng thái:** còn hiệu lực — đảo một phần quyết định "không gate ngược tiến độ Job theo OS-OUT/
OS-IN" (`docs/domains/production.md`, `docs/domains/inventory.md`,
`docs/workflows/outsourcing-round-trip.md`, tất cả trước 2026-08-31).

## Bối cảnh

Người dùng phát hiện: khi 1 công đoạn `OUTSOURCE` của Job có IQC vừa `COMPLETED`, cả Job nhảy thẳng
sang `WAITING_DELIVERY` ("chờ giao hàng") dù các công đoạn khác của Job còn dở — đúng lúc quy trình
sản xuất chưa xong.

Nguyên nhân: `production_job_operations.completedQuantity`/`completedDate` (cột đã có sẵn từ trước)
chưa từng có đường ghi cho công đoạn `OUTSOURCE` — `OutsourcingReceiptsService`/`IqcService` không
đụng tới bảng đó. `closeJobIfQcCovered` (`src/api/oqc/oqc.query.ts`, nơi duy nhất ghi
`WAITING_DELIVERY`) chỉ đếm **số dòng `quality_inspections` đã đóng** (`getJobQcCoverage`), không
đếm công đoạn nào thật sự xong. Một công đoạn `OUTSOURCE` duy nhất có 1 dòng IQC (vừa hoàn tất) →
`coverage.total > 0 && coverage.open === 0` → Job nhảy `WAITING_DELIVERY` dù công đoạn khác
`completedDate` vẫn `NULL`.

Đây từng là giới hạn phạm vi **có chủ đích, có ghi trong doc** — 3 file domain/workflow đều nói
"không gate ngược tiến độ Job theo OS-OUT/OS-IN". Sửa lần này đảo lại quyết định đó.

## Quyết định

**Điểm kích hoạt ghi tiến độ = lúc OS-IN `POSTED`** (không phải lúc IQC `COMPLETED`). `requiresIqc`
là tuỳ chọn per-receipt — nhiều phiếu OS-IN không có IQC, nếu gate theo IQC thì những công đoạn đó sẽ
để trống `completedQuantity`/`completedDate` vĩnh viễn, y hệt bug đang sửa nhưng ở dạng khác.

`recomputeOutsourcedOperationProgress` (`src/api/production-jobs/production-jobs.query.ts`, hàm
thuần export, không qua NestJS DI — cùng khuôn `recomputeOutsourcingOrderStatus`,
`docs/decisions/outsourcing-order-status-progress-merge.md`) là nguồn ghi duy nhất cho
`completedQuantity`/`completedDate` của một công đoạn `OUTSOURCE`:

- `completedQuantity` = Σ `outsourcing_receipt_items.quantity` (mọi OS-IN `POSTED`) trỏ đúng
  `productionJobOperationId` đó.
- `completedDate` set (`new Date()`) khi `completedQuantity >= productionJobBomItems.plannedQuantity`
  — đúng ngưỡng nhánh trong nhà (`updateProductionJobOperation`/`createJobOperationReport`) đang
  dùng; `NULL` nếu chưa đủ.
- **`rejectedQuantity` giữ nguyên `0`** — không suy từ disposition IQC. Luật cũ "không nhánh QC nào
  ghi ngược `completedQuantity`/`completedDate`, kể cả `SCRAP`" (`docs/domains/production.md`) vẫn
  đúng; hàng FAIL/SORT/RETURN đã có `supplier_returns` xử lý riêng, suy thêm ở đây sẽ đếm trùng.

Gọi từ 2 điểm trong `OutsourcingReceiptsService` (cùng `tx` với thao tác vừa gây thay đổi SL nhận,
không phải cron/job riêng):

1. `createOutsourcingReceipt` — SL nhận tăng (gọi cho từng `productionJobOperationId` bị ảnh hưởng,
   1 phiếu OS-IN có thể chạm nhiều công đoạn).
2. `cancelOutsourcingReceipt` — SL nhận giảm lại; `getRecomputeTargetsForReceipt` (đổi tên từ
   `getOrderIdsForReceipt`) lấy cả `outsourcingOrderIds` lẫn `productionJobOperationIds` **trước**
   khi `UPDATE ... CANCELLED`, gọi recompute **sau**.

Nếu công đoạn vừa hoàn tất thuộc node FG (`itemType = FG`), `recomputeOutsourcedOperationProgress`
gọi tiếp `closeJobIfFinalAssemblyDone` — có thể đẩy Job `IN_PROGRESS → WAITING_QC` ngay từ OS-IN,
không đợi thao tác trong-nhà nào khác.

**Gate `WAITING_DELIVERY` siết thêm điều kiện "không còn công đoạn nào dở"** —
`closeJobIfQcCovered` (`oqc.query.ts`) giờ AND thêm `countPendingJobOperations(tx, productionJobId)
=== 0` (đếm mọi `production_job_operations` của Job, bất kể loại, `completedDate IS NULL`) vào điều
kiện cũ (`coverage.total > 0 && coverage.open === 0`). **Không sửa `getJobQcCoverage`** — đang bị
`InventoryReceiptsService` dùng cho `E209` và `OutboundOrdersService` dùng cho `E205`, đổi shape của
nó sẽ ảnh hưởng 2 gate không liên quan.

`closeJobIfFinalAssemblyDone` (đếm lại "còn công đoạn FG nào dở") được gom từ 2 khối inline giống hệt
nhau trước đây nằm ở `ProductionJobsService.updateProductionJobOperation` và
`ProductionExecutionService.createJobOperationReport` — bắt buộc gom vì
`recomputeOutsourcedOperationProgress` là điểm gọi thứ 3 cần đúng logic đó, không phải refactor
ngoài phạm vi.

Job status **không** revert khi huỷ OS-IN — vòng đời 1 chiều, giữ nguyên convention hiện có
(`production.md`, Lifecycle).

## Không backfill dữ liệu cũ

Không đổi schema (`completedQuantity`/`completedDate` đã có cột sẵn), không chạy `UPDATE` backfill
cho công đoạn `OUTSOURCE`/Job đã tồn tại trước ngày đổi — công đoạn cũ tự cập nhật đúng vào lần OS-IN
tiếp theo (create hoặc cancel), Job đã lỡ ở `WAITING_DELIVERY` sai không tự lùi lại (đọc mục trên).

## Đừng hoàn lại

- Đừng suy `rejectedQuantity` của công đoạn `OUTSOURCE` từ disposition IQC — xem lý do ở mục Quyết
  định (đếm trùng với `supplier_returns`).
- Đừng sửa `getJobQcCoverage` để cộng thêm điều kiện công đoạn — 2 gate khác (`E205`/`E209`) đang
  dùng đúng shape hiện tại, cộng thêm ở `closeJobIfQcCovered` chứ không phải hàm coverage dùng chung.
- Đừng revert `production_jobs.status` khi huỷ OS-IN — vòng đời Job vẫn 1 chiều.
- Đừng gọi `recomputeOutsourcedOperationProgress`/`closeJobIfFinalAssemblyDone` ngoài `tx` của thao
  tác vừa gây thay đổi.
- Đừng đổi điểm kích hoạt sang lúc IQC `COMPLETED` — nhiều OS-IN không `requiresIqc`, sẽ tái tạo
  đúng bug đang sửa.

## Related docs

`docs/domains/production.md` (Lifecycle, Cross-domain ↔ Quality / ← Inventory),
`docs/domains/inventory.md` (Cross-domain ← Production), `docs/workflows/outsourcing-round-trip.md`
(State changes, Side effects), `docs/decisions/production-lifecycle-closing.md` (site of authority
gốc cho `WAITING_QC → WAITING_DELIVERY`), `docs/decisions/outsourcing-order-status-progress-merge.md`
(nguồn gốc khuôn `recompute*` hàm thuần dùng lại ở đây).
