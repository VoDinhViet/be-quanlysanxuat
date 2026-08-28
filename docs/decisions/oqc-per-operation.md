# OQC đổi từ gắn theo Job sang gắn theo công đoạn

**Trạng thái:** còn hiệu lực

## Bối cảnh

Thiết kế ban đầu: `oqc_inspections.productionJobId` là FK bắt buộc duy nhất, `itemId` snapshot
thẳng từ `job.itemId` — nói cách khác, một dòng OQC coi cả Job (1 sản phẩm FG trong LSX) là một lô
kiểm. Điều này đúng khi OQC chỉ được hiểu là "kiểm thành phẩm trước khi nhập kho", nhưng sai với
nghiệp vụ thật khi user cung cấp khung phân vai rõ ràng: **IQC đảm nhiệm QC vật tư** (hàng nhập từ
NCC), **OQC đảm nhiệm QC công đoạn** (từng bước gia công/lắp ráp bên trong một Job, không chỉ bước
cuối cùng ra thành phẩm). Một Job có thể có nhiều công đoạn (`production_job_operations`, đã có sẵn
`completedQuantity`/`completedDate` theo dõi tiến độ từng bước) — model cũ không có chỗ để lưu "QC
công đoạn X của Job Y", chỉ QC được cả Job như một khối.

Hai phương án tầng để gắn OQC được cân nhắc:

1. **`production_job_operations`** — công đoạn as-used của từng node WIP trong cây BOM của Job, đã
   có snapshot + tiến độ theo Job.
2. Tầng Cấp 0 của chính FG (`routings`/`routing_operations`) — định nghĩa tĩnh công đoạn của item
   gốc, **không có snapshot theo Job, không có theo dõi tiến độ**.

## Quyết định

**Chọn phương án 1 — `oqc_inspections` gắn theo `production_job_operations`, không tạo bảng mới cho
tầng Cấp 0.**

- Thêm cột `productionJobOperationId` — **nullable**, ép bắt buộc theo `kind` bằng CHECK
  (`chk_qc_requests_outgoing_job`, `docs/decisions/qc-data-model.md`) thay vì `NOT NULL` cứng trên
  cột, vì `qc_requests` giờ dùng chung cho cả IQC lẫn OQC (một bảng vật lý, `kind` phân nhánh) —
  `onDelete: 'restrict'`; LSX một khi `APPROVED` không có đường nào xoá được cây
  `production_job_operations`/`production_job_bom_items` của nó nữa (`ensureItemsNotLockedByProduction`
  chặn cứng `E080` khi còn thao tác trên LSX đã duyệt), nên FK không cần phòng hờ mồ côi. Chi tiết:
  `docs/domains/quality-oqc.md`.
- Giữ `productionJobId`, cùng lý do trên (nullable + CHECK theo `kind`, không `NOT NULL` cứng) —
  denormalize từ `operation.productionJobId`, dùng để lọc/join theo Job không phải qua
  `production_job_operations`, và là neo cho 2 gate cross-domain (gate nhập kho TP, gate giao hàng —
  cả hai đều hỏi "Job này đã QC xong hết chưa", không hỏi "công đoạn này đã QC xong chưa").
- `operationCode`/`operationName`/`bomItem.code`/`bomItem.name` **không còn là cột lưu** — đọc thẳng
  qua relation `productionJobOperation`/`productionJobOperation.bomItem` lúc `GET`, response DTO vẫn
  trả nested `operation`/`bomItem` (xem `docs/domains/quality-oqc.md`).
- `itemId` đổi nguồn: từ `job.itemId` (thành phẩm) sang `bomItem.itemId` (part của node BOM chứa
  công đoạn) — đây là thay đổi ngữ nghĩa quan trọng nhất: **`itemId` của một dòng OQC không còn là
  thành phẩm cuối cùng, mà là part đang được QC ở đúng công đoạn đó** (có thể là WIP trung gian).
- Trần chặn SL đổi từ `production_jobs.quantity` (SL kế hoạch FG) sang hai mốc: cột `plannedQuantity`
  (đã đóng băng lúc duyệt LSX) của chính node BOM (`E176`) và `completedQuantity` của chính công
  đoạn (`E198`, mới) — không còn ý nghĩa "so với SL kế hoạch của cả Job" vì đơn vị QC giờ là part,
  không phải FG.

## Hệ quả kéo theo — khai tử E180, thay bằng E196/E197

`E180` (`inventory_receipt.error.oqc_pass_quantity_exceeded`) so trực tiếp Σ SL nhập kho TP với Σ
`quantity` các dòng OQC `COMPLETED` — hợp lý khi 1 dòng OQC = 1 lô FG. Sau khi đổi model, Σ SL OQC
là tổng của nhiều part khác nhau ở nhiều công đoạn khác nhau, **không cùng đơn vị** với SL nhập kho
TP (luôn là FG) — so trực tiếp là sai, dù giữ nguyên mã lỗi cũng là nói dối client về ý nghĩa con số.

**Đã cân nhắc và loại:** quy đổi tỉ lệ SL part → FG theo `plannedQuantity` của node (vd node "Lắp
ráp" cần 2 part/1 FG thì chia 2). Loại vì: (1) double-count khi một part xuất hiện ở nhiều node của
cây BOM — không có cách gộp đúng nghĩa; (2) vẫn không đo được SL FG thật, vì không có OQC nào gắn
cho chính Cấp 0 (bước cuối ra thành phẩm) — quy đổi từ QC các bước *trung gian* để suy ra QC bước
*cuối* là suy diễn, không phải dữ liệu thật.

**Thay bằng `E196`/`E197`** — đổi hẳn bản chất phép so sánh, từ so **số lượng** sang so **trạng
thái + trần kế hoạch**:

- `E196`: Job phải có ≥1 phiếu OQC, và không còn phiếu nào chưa `COMPLETED` — hàm đọc gate này đã đổi
  tên/hợp nhất thành `getJobQcCoverage` (`docs/decisions/qc-data-model.md`), cùng ngữ nghĩa.
- `E197`: SL nhập kho TP (cộng dồn) vẫn chặn trần theo `production_jobs.quantity` — giữ nguyên ý
  nghĩa "không nhập vượt kế hoạch", chỉ tách riêng khỏi điều kiện QC.

`E180` giữ số, đánh dấu dự phòng trong `error-code.constant.ts` — không tái sử dụng cho một kiểm tra
khác.

## `result` tự suy từ Ac/Re — chỉ áp cho OQC

Cùng đợt đổi model, thêm `resultAuto` (server tự suy từ `defectQty` so `ac` của plan AQL) và cho QC
toàn quyền ghi đè, không cần lý do (`E201` từng bắt buộc kèm lý do khi lệch, đã nghỉ hưu — AQL chỉ
còn là gợi ý hiển thị, `docs/domains/quality-oqc.md`). **Chỉ áp cho OQC** — IQC giữ nguyên hành vi cũ
(QC tự chọn `result` hoàn toàn, bảng AQL chỉ tính `ac`/`re` tham khảo, không ảnh hưởng khả năng lưu
kết quả). Hai module cố tình lệch nhau ở điểm này.

## Giữ nguyên, không đổi

- `OqcDisposition` (`ACCEPT`/`REWORK`/`SCRAP`) — enum riêng của OQC, không dùng chung
  `IqcDisposition` (`CONCESSION`/`SORT`/`RETURN`) vì OQC là QC nội bộ sản xuất, không có NCC để trả
  hàng.
- `E177`/`E178`/`E181` (OQC đã `COMPLETED`, không xoá được, mã trùng) — không đổi ngữ nghĩa. `E175`
  **đã đổi** ở một đợt sau quyết định này — nay chấp nhận cả `IN_PROGRESS` lẫn `WAITING_QC` (Job tự
  chuyển `WAITING_QC` ngay khi công đoạn Cấp 0 xong), xem `docs/domains/quality-oqc.md`.

## QC cho Cấp 0 (bước cuối ra thành phẩm) — đã làm, không phải bảng mới

Mục "Đừng hoàn lại" bản trước từng nói: nếu cần QC riêng cho Cấp 0 thì phải thêm bảng/snapshot riêng
cho `routings`/`routing_operations` theo Job. Khi thật sự cần (gate `E209` — Job chưa từng QC thành
phẩm thì không cho nhập kho), quyết định cuối **không** làm vậy — tái dùng thẳng
`production_job_bom_items`/`production_job_operations` đã có, không tạo bảng thứ ba:

- `production_job_bom_items` nhận thêm **đúng một** node mỗi Job, `itemType = 'FG'` (dùng chung enum
  `ItemType` sẵn có, không phải enum riêng), `parentId = NULL`, `level = 0` (ngoài quy ước 1-based
  của cây BOM — cố ý, không phải một cấp con), `sortOrder` lớn nhất Job (đứng cuối), `quantity = 1`,
  `plannedQuantity = job.quantity`. Chỉ tạo khi item FG có khai routing Cấp 0
  (`ProductionJobsService.copyFinalAssemblyRouting`, gọi ngay sau `copyBomTree` trong transaction
  duyệt LSX) — bỏ qua, không tạo node rỗng, nếu item không khai routing Cấp 0.
- `production_job_operations` snapshot công đoạn của node đó y hệt cách snapshot node WIP thường —
  không nhánh code riêng.
- **Một Job nhiều nhất một node Cấp 0** — `uniqueIndex('uq_production_job_bom_items_final_assembly')
  .on(productionJobId).where(item_type = 'FG')`.
- Bước Lắp ráp (công đoạn của node Cấp 0) chỉ mở khi **mọi** công đoạn khác của Job đã báo hoàn
  thành (`completedDate` khác null) — `E210` chặn `PATCH .../operations/:operationId` nếu chưa.
- OQC gắn vào công đoạn của node Cấp 0 y hệt mọi công đoạn khác — không route/bảng riêng.
  `getJobQcCoverage` (`docs/decisions/qc-data-model.md`) đọc cờ `isFinalAssembly` qua
  `productionJobBomItems.itemType = 'FG'` để tính `E209` tách khỏi `E196`.
- **Entry point tạo OQC cho Cấp 0 đổi chỗ:** từ popup chọn tay `GET /oqc/inspectable-operations` +
  `POST /oqc` (tạo được cho bất kỳ công đoạn nào, kể cả Cấp 0) sang đúng một route cấp Job, không
  nhận body: `POST /production-jobs/:jobId/qc` —
  `OqcService.createOqcForJob` tự tìm công đoạn Cấp 0 của Job (1 Job = 1 FG nên "QC cho Job" nghĩa
  là QC cho chính bước lắp ráp cuối), tự suy `quantity`/`inspectionDate`, không tạo được cho công
  đoạn nào khác ngoài Cấp 0 qua API nữa. Chi tiết: `docs/workflows/outgoing-qc.md`.

Lý do tái dùng thay vì bảng mới: node Cấp 0 cần đúng những gì `production_job_bom_items`/
`production_job_operations` đã cung cấp cho mọi node khác (snapshot, `plannedQuantity` đóng băng,
neo cho OQC) — một bảng thứ ba sẽ trùng lặp toàn bộ cột mà không thêm gì, và mọi query đọc "công
đoạn của Job" (`getProductionJobOperations`, `getJobQcCoverage`) sẽ phải hợp nhất 2 nguồn thay vì 1.

## Đừng hoàn lại

Đừng tạo bảng/snapshot riêng cho routing Cấp 0 theo Job — đã cân nhắc và bác, xem mục trên. Node Cấp
0 **luôn luôn** là một node `production_job_bom_items` bình thường với `itemType = 'FG'`, phân biệt
bằng cột đó, không bằng bảng khác.

## Related docs

`docs/decisions/qc-gates-on-stock-moves.md` (quyết định song song, thêm 2 gate cross-domain).
`docs/decisions/qc-data-model.md` (`getJobQcCoverage` hợp nhất OQC + IQC gia công ngoài theo công
đoạn, kế thừa neo `production_job_operations` mà quyết định này thiết lập). `docs/domains/
quality.md`, `docs/domains/production.md`, `docs/domains/inventory.md`, `docs/workflows/outgoing-qc.md`.
