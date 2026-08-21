# IQC + OQC gộp một bảng `quality_inspections`

**Trạng thái:** còn hiệu lực

## Bối cảnh

Thiết kế trước: hai bảng tách rời — `iqc_inspections` (kiểm hàng nhập từ NCC) và `oqc_inspections`
(kiểm công đoạn sản xuất), độc lập hoàn toàn, hai module `iqc`/`oqc` không chia sẻ gì ở tầng dữ liệu.

Đợt thêm gia công ngoài vào luồng QC — công đoạn `type = OUTSOURCE` không QC bằng OQC (không có NCC
để trả hàng lỗi) mà bằng IQC sinh từ phiếu nhận gia công (OS-IN, `E211` chặn tạo OQC cho công đoạn
này) — phơi ra hệ quả của việc tách bảng: chỉ **một** loại QC mới mà phải đẻ thêm 4 hàm gate
(`getJobOqcClearance`, `hasFinalAssembly`, `getJobOutsourcingIqcClearance`,
`hasOutsourcedOperation`), một mã lỗi (`E212`), và ba lỗi thật:

1. `iqc_inspections` không có liên kết nào tới công đoạn/dòng OS-IN sinh ra nó — gate phải join mờ
   theo `(outsourcingReceiptId, itemId)`. Một OS-IN gộp được nhiều OS-OUT của **các Job khác nhau**
   (cùng NCC) → IQC của Job B lẫn vào clearance của Job A.
2. `E212` (Job có công đoạn `OUTSOURCE` mà chưa có IQC nào) khoá chết: OS-IN mặc định
   `requiresIqc = false` → không sinh IQC → Job vĩnh viễn không `confirm` được phiếu nhập TP.
3. Phiếu OQC cũ (từ trước khi có nhánh IQC-cho-gia-công-ngoài) vẫn gắn công đoạn `OUTSOURCE` và vẫn
   nằm trong gate OQC → công đoạn gia công ngoài bị gate hai lần.

Gốc chung của cả ba: mỗi loại QC mới bắt **mọi gate và mọi báo cáo** phải học rằng nó tồn tại, vì
không có một điểm đọc chung. Hai bảng tách rời cũng không phải thiết kế chuẩn cho quan hệ này — IQC
và OQC là supertype/subtype thật (~22/33 cột IQC, ~22/25 cột OQC trùng nhau; cùng khái niệm "một lần
kiểm theo AQL"), và ERP thật không tách: SAP QM dùng một bảng inspection lot (`QALS`) + inspection
type; Odoo dùng một model `quality.check`.

## Quyết định

**Gộp về một bảng `quality_inspections` + cột discriminator `kind` (`INCOMING`/`OUTGOING`), không
tách cha–con.**

Đã cân nhắc class-table inheritance (bảng cha giữ cột chung + hai bảng con giữ cột riêng từng
nhánh) và **loại** — lý do kỹ thuật cụ thể, không phải sở thích: hai CHECK đang có
(`chk_quality_inspections_disposition_requires_fail` so `disposition` với `result`; `chk_quality_inspections_sort_qty_total` so
`sortOkQty + sortNgQty` với `quantity`) so sánh cột thuộc **hai nhánh khác nhau về mặt khái niệm**
nhưng **phải nằm cùng một bảng vật lý** để Postgres viết được — cha–con thì hai vế nằm hai bảng,
mất khả năng viết CHECK cross-table, phải đẩy cả hai bất biến này xuống tầng service (mất một lớp
phòng thủ DB đang có), mà vẫn phải join mỗi lần đọc. Một bảng phẳng giữ được cả CHECK.

## Hình dạng

- **Cột chung** (~22): `id`, `code` (unique **toàn bảng**, không theo `kind` — hai đường sinh mã dùng
  prefix khác nhau `IQC-*`/`OQC-*` nên không đụng nhau), `kind`, `itemId`, `quantity`,
  `inspectionDate`, khối AQL (`inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`result`),
  `resultAuto` (chỉ `OUTGOING` dùng, luôn `NULL` ở `INCOMING`), `disposition`, `status`,
  `resultNote`/`dispositionNote`/`note`, `confirmedBy/At`, `resolvedBy/At`, audit.
- **Cột riêng `INCOMING`** (12): `supplierId`, `inventoryReceiptId`, `outsourcingReceiptId`,
  `outsourcingReceiptItemId`, `purchaseOrderId`, `reason`, `inspectionStandard`/`inspectorName`/
  `measuringTools`, `qcDepartmentId`, `sortOkQty`/`sortNgQty`.
- **Cột neo sản xuất, dùng chung cả hai nhánh**: `productionJobId`/`productionJobOperationId`.
  `OUTGOING` bắt buộc có (`chk_quality_inspections_outgoing_job`); `INCOMING` có khi phiếu sinh từ OS-IN (server suy
  từ `outsourcingReceiptItem → outsourcingOrderItem`), `NULL` khi là hàng mua thường. **Đây là cột
  làm việc gộp có giá trị thật**: một công đoạn `INHOUSE` chỉ có thể có dòng `OUTGOING` (OQC) trỏ
  vào, một công đoạn `OUTSOURCE` chỉ có thể có dòng `INCOMING` (IQC từ OS-IN) trỏ vào — hai tập
  không giao nhau, nên một gate LEFT JOIN theo đúng cột `productionJobOperationId` này tự nhiên gộp
  đúng cả hai nhánh, không cần lọc `kind` (xem `getJobQcCoverage`,
  `src/api/oqc/oqc.query.ts`).

**3 `NOT NULL` đổi thành CHECK theo `kind`** — mất mát thật của việc gộp so với cha–con, chấp nhận
có chủ ý: `supplierId`/`productionJobId`/`productionJobOperationId` không còn `NOT NULL` ở tầng cột,
thay bằng `chk_quality_inspections_incoming_supplier`/`chk_quality_inspections_outgoing_no_supplier`/`chk_quality_inspections_outgoing_job` — tương
đương về mặt đảm bảo (CHECK cũng chặn ở DB, chỉ khác thông báo lỗi), khác là code đọc cột này (hiếm,
chỉ 2-3 chỗ) phải tự biết `kind` đã lọc đúng trước khi coi giá trị là non-null (xem
`IqcService`/`OqcService`, các chỗ `.$type<>()`/non-null assertion kèm comment trỏ CHECK tương
ứng).

**`supplier_returns.iqc_id`** — trước gộp, FK đơn giản đảm bảo cột này chỉ trỏ được vào
`iqc_inspections`. Bảng gộp làm mất khả năng đó (giờ trỏ được vào bất kỳ dòng nào, kể cả `OUTGOING`).
Lấy lại bằng composite FK không cần trigger: thêm cột `qc_kind` (luôn `'INCOMING'`, CHECK khoá lại),
FK `(iqc_id, qc_kind) → quality_inspections(id, kind)` (cần `UNIQUE (id, kind)` phụ trên
`quality_inspections`, xem `uq_quality_inspections_id_kind`).

**Enum Postgres hợp nhất, enum TS giữ nguyên tách** — cột vật lý dùng `qc_status`/`qc_disposition`
(union giá trị của cả hai nhánh), nhưng TS vẫn export `IqcStatus`/`OqcStatus`/`IqcDisposition`/
`OqcDisposition` riêng (không đổi tên, không đổi giá trị) để hai module `iqc`/`oqc` không phải sửa
một dòng logic nào ngoài đổi bảng đích — chỉ cột được khai `.$type<IqcStatus | OqcStatus>()` (tương
tự `.$type<IqcDisposition | OqcDisposition>()`) để TypeScript coi cả hai enum là hợp lệ trên cùng
một cột, thay vì suy ra một union kiểu string thô từ mảng giá trị mixed. `IqcResult`/
`IqcInspectionLevel` **thật sự dùng chung** (không phải ghi đè `.$type`) — cả hai nhánh cùng dùng
đúng một enum từ trước khi gộp, không đổi.

## Hai module `iqc`/`oqc` không tách/không gộp

Route, `ErrorCode`, phần lớn DTO **giữ nguyên** — chỉ đổi bảng đích (`qualityInspections` thay
`iqcInspections`/`oqcInspections`) và thêm `eq(kind, ...)` vào **mọi** `where`/`insert`. Rủi ro
chính của việc gộp là quên một mệnh đề `kind` khiến module này thấy phiếu của module kia — không có
cơ chế nào ở tầng TypeScript tự bắt lỗi này (không có kiểu con `IncomingRow`/`OutgoingRow` tách
biệt), nên đọc lại call site khi sửa `IqcService`/`OqcService` sau này.

## Vấn đề circular-import khi implement

`quality-inspections.ts` (bảng) và `supplier-returns.ts` (composite FK) tạo một vòng lặp module
**thật** — khác vòng lặp vô hại vẫn có sẵn ở nhiều cặp bảng khác trong repo (FK/`relations()` dùng
thunk `() => x.id`, chỉ gọi sau khi mọi module đã load xong). Composite FK (`foreignKey({...})`,
API công khai của drizzle-orm) nhận **object trực tiếp**, không nhận thunk — buộc
`supplier-returns.ts` dereference `qualityInspections.id`/`.kind` NGAY lúc module-load. Nếu
`quality-inspections.ts` import `supplierReturns` (cho quan hệ `many()`) ở cùng file, hai chiều
import tạo vòng lặp `ReferenceError: Cannot access '...' before initialization`. Giải: tách
`qualityInspectionsRelations` ra file riêng (`quality-inspections-relations.ts`) — file bảng chính
không còn cạnh nào quay lại `supplier-returns.ts`.

## Migration dữ liệu

Copy `id` nguyên vẹn từ `iqc_inspections`/`oqc_inspections` sang `quality_inspections` — `code` hai
bảng khác prefix nên không đụng UNIQUE mới, `supplier_returns.iqc_id`/`qc_attachments.inspection_id`
không phải remap. Backfill `outsourcing_receipt_item_id`/`production_job_id`/
`production_job_operation_id` cho IQC sinh từ OS-IN: match theo `(outsourcing_receipt_id, item_id)`
**chỉ khi đúng 1 dòng OS-IN khớp** — mơ hồ thì để `NULL`, không đoán (chính là lỗ hổng của join mờ
cũ, xem Bối cảnh). **Bỏ** dữ liệu OQC cũ gắn công đoạn `type = OUTSOURCE` — đã chốt với user: công
đoạn gia công ngoài chỉ QC bằng nhánh `INCOMING` từ giờ, phiếu OQC cũ cho ca đó không còn ý nghĩa.

## Hệ quả kéo theo — khai tử E212

`E212` chưa từng phát hành. Điều kiện của nó ("Job có công đoạn `OUTSOURCE` mà chưa có IQC nào từ
OS-IN") hoá ra là **tập con** của `E196` sau khi `getJobQcCoverage` gộp cả hai nhánh theo công đoạn:
một công đoạn `OUTSOURCE` mà OS-IN chưa từng `requiresIqc` đóng góp `(total=0, open=0)` vào tổng của
Job — không tự nó chặn gì (đúng semantics gốc `E196`, vốn chỉ đòi Σ`total`≥1 và Σ`open`=0 ở mức
Job, không đòi từng công đoạn phải có dòng QC riêng). Nếu OS-IN **có** `requiresIqc = true`, dòng
IQC sinh ra đóng góp vào `open` cho tới khi `COMPLETED` — `E196` đã bắt đúng ca "đã yêu cầu mà chưa
xong". Giữ số `E212`, không tái sử dụng.

## Đừng hoàn lại

Thêm một loại QC mới (nếu tương lai có, vd kiểm hàng trả về từ khách) là thêm một giá trị `kind` +
cột neo/CHECK tương ứng trên `quality_inspections` — **không** phải tạo bảng mới. Nếu thấy một gate
phải tự viết hàm join riêng cho một loại QC cụ thể (như `getJobOutsourcingIqcClearance` đã từng),
đó là dấu hiệu neo công đoạn/kind đang thiếu, không phải lý do tách bảng lại.

## Related docs

`docs/decisions/oqc-per-operation.md` (mô hình node Cấp 0 + gate theo công đoạn — vẫn đúng, chỉ đổi
nguồn đọc sang bảng gộp). `docs/decisions/qc-gates-on-stock-moves.md` (gate hợp nhất). Chương "OQC"
`docs/domains/quality.md`.
