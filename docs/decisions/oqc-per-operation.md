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

- Thêm cột `productionJobOperationId` (nullable, `SET NULL` — cùng lý do `productionJobId`, một
  công đoạn có thể hard-delete cùng Job khi LSX được duyệt lại), bắt buộc ở service
  (`CreateOqcReqDto`), không bắt buộc ở DB để dữ liệu cũ (gắn thẳng Job, trước đợt đổi này) sống
  sót.
- Giữ `productionJobId`, đổi ngữ nghĩa: server tự set, denormalize từ `operation.productionJobId`
  — không còn là FK chính, chỉ để lọc/join theo Job không phải qua `production_job_operations`, và
  là neo cho 2 gate cross-domain (gate nhập kho TP, gate giao hàng — cả hai đều hỏi "Job này đã QC
  xong hết chưa", không hỏi "công đoạn này đã QC xong chưa").
- Thêm 4 cột snapshot bắt buộc (NOT NULL) lúc tạo: `operationCode`/`operationName`/`partCode`/
  `partName` — khuôn `outsourcing_order_items`, nguồn hiển thị chính khi
  `productionJobOperationId` về `null`.
- `itemId` đổi nguồn: từ `job.itemId` (thành phẩm) sang `bomItem.itemId` (part của node BOM chứa
  công đoạn) — đây là thay đổi ngữ nghĩa quan trọng nhất: **`itemId` của một dòng OQC không còn là
  thành phẩm cuối cùng, mà là part đang được QC ở đúng công đoạn đó** (có thể là WIP trung gian).
- Trần chặn SL đổi từ `production_jobs.quantity` (SL kế hoạch FG) sang hai mốc: SL kế hoạch của
  chính node BOM (`E176`, `resolvePlannedQuantities`) và `completedQuantity` của chính công đoạn
  (`E198`, mới) — không còn ý nghĩa "so với SL kế hoạch của cả Job" vì đơn vị QC giờ là part, không
  phải FG.

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

- `E196`: Job phải có ≥1 phiếu OQC, và không còn phiếu nào chưa `COMPLETED` (`getJobOqcClearance`).
- `E197`: SL nhập kho TP (cộng dồn) vẫn chặn trần theo `production_jobs.quantity` — giữ nguyên ý
  nghĩa "không nhập vượt kế hoạch", chỉ tách riêng khỏi điều kiện QC.

`E180` giữ số, đánh dấu dự phòng trong `error-code.constant.ts` — không tái sử dụng cho một kiểm tra
khác.

## `result` tự suy từ Ac/Re — chỉ áp cho OQC

Cùng đợt đổi model, thêm `resultAuto` (server tự suy từ `defectQty` so `ac` của plan AQL) và cho QC
ghi đè có vết (`E201` nếu lệch mà không kèm lý do). **Chỉ áp cho OQC** — IQC giữ nguyên hành vi cũ
(QC tự chọn `result` hoàn toàn, bảng AQL chỉ tính `ac`/`re` tham khảo, không ảnh hưởng khả năng lưu
kết quả). Hai module cố tình lệch nhau ở điểm này.

## Giữ nguyên, không đổi

- `OqcDisposition` (`ACCEPT`/`REWORK`/`SCRAP`) — enum riêng của OQC, không dùng chung
  `IqcDisposition` (`CONCESSION`/`SORT`/`RETURN`) vì OQC là QC nội bộ sản xuất, không có NCC để trả
  hàng.
- `E175`/`E177`/`E178`/`E181` (Job không `IN_PROGRESS`, đã `COMPLETED`, không xoá được, mã trùng) —
  không đổi ngữ nghĩa.
- Công đoạn Cấp 0 của chính FG vẫn không có nơi để QC riêng — `E196` (mọi OQC công đoạn phải xong)
  là thứ gần nhất thay thế được, chấp nhận có chủ ý.

## Đừng hoàn lại

Nếu sau này thật sự cần QC riêng cho bước cuối ra thành phẩm (Cấp 0), thiết kế đúng là thêm một
bảng/snapshot riêng cho `routings`/`routing_operations` theo Job (tương tự
`production_job_operations` đã làm cho WIP) — không phải quay lại gắn OQC thẳng vào `production_
jobs` như model cũ, vì đó là bước lùi mất khả năng QC từng công đoạn trung gian.

## Related docs

`docs/decisions/qc-gates-on-stock-moves.md` (quyết định song song, thêm 2 gate cross-domain dùng
chung `getJobOqcClearance` với quyết định này). `docs/domains/quality.md`, `docs/domains/
production.md`, `docs/domains/inventory.md`, `docs/workflows/final-qc.md`.
