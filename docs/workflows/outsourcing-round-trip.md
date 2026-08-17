# Gia công ngoài: OS-OUT → OS-IN → QC tuỳ chọn

Chặng nối `production` → `inventory` → `quality`: từ lúc lập phiếu gửi vật tư/WIP ra một NCC gia
công ngoài, tới lúc nhận hàng về, và (tuỳ chọn) kiểm chất lượng hàng nhận về giống hệt cách IQC xử
lý hàng nhập mua. Mô hình `outsourcing_orders`/`outsourcing_order_items`/`outsourcing_receipts`/
`outsourcing_receipt_items` ở `docs/domains/inventory.md`, mô hình `production_job_operations`
(anchor) + `resolvePlannedQuantities` ở `docs/domains/production.md`, mô hình `iqc_inspections` ở
`docs/domains/quality.md`; đây là trình tự đầy đủ nối ba domain đó.

Cả hai chứng từ là **header + nhiều dòng** (khác thiết kế lần đầu — bảng phẳng 1 phiếu = 1 dòng vật
tư, xem lịch sử ở `docs/domains/inventory.md` Common mistakes #19). Một OS-OUT gom nhiều part/công
đoạn trong cùng một lượt gửi; một OS-IN gộp hàng về từ nhiều OS-OUT khác nhau miễn cùng một NCC.
**Không có bước nháp** — `create` là gửi/nhận luôn (`docs/decisions/outsourcing-no-draft.md`).

## Trigger

- `GET /outsourcing-orders/outsourceable-operations` — popup "chọn part cần gia công": liệt kê công
  đoạn `OUTSOURCE` của các Job `IN_PROGRESS`, kèm định mức/đã gửi/còn được phép gửi (chỉ tính cho
  đúng trang đã phân trang, không tính rồi lọc như bản đầu).
- `POST /outsourcing-orders` — lập phiếu gửi gia công ngoài (OS-OUT), nhiều dòng, tay — `POSTED`
  ngay, trừ tồn kho gửi theo từng dòng trong cùng transaction.
- `GET /outsourcing-receipts/pending-order-items` — popup "chọn hàng cần nhận": liệt kê dòng OS-OUT
  thuộc phiếu `POSTED`.
- `POST /outsourcing-receipts` — lập phiếu nhận gia công ngoài (OS-IN), nhiều dòng, mỗi dòng trỏ
  đúng 1 dòng OS-OUT (thuộc phiếu đã `POSTED`), tay. Một dòng OS-OUT nhận được nhiều lần (partial).
  `POSTED` ngay, cộng tồn kho nhận theo từng dòng; nếu `requiresIqc = true`, cùng transaction sinh N
  dòng `iqc_inspections` (1/dòng phiếu).
- `POST /outsourcing-orders/:id/cancel` / `POST /outsourcing-receipts/:id/cancel` — huỷ phiếu đã
  `POSTED`, đảo bút toán.
- (Nếu có IQC) `POST /iqc/:iqcId/confirm` với `result = FAIL` + `disposition = SORT`/`RETURN` — tự
  sinh `supplier_returns`, tiếp tục đúng luồng đã có ở `docs/workflows/supplier-return.md`.

## Actor

`outsourcing:create` để lập (và do đó gửi/nhận luôn) OS-OUT/OS-IN, `outsourcing:update` cho `cancel`
cả hai. `PRODUCTION` giữ đủ cả 4 quyền; `WAREHOUSE` có `create` (bên thực tế nhận hàng OS-IN) cộng
`update`/`delete` (`delete` không còn route nào dùng tới sau khi bỏ nháp, giữ lại vô hại). `iqc:update`
cho bước `confirm` IQC (nếu có nhánh QC) — không khác gì luồng IQC trên phiếu nhập mua từ điểm này
trở đi.

## Preconditions

| Điều kiện | OS-OUT `create` | OS-IN `create` |
| --- | --- | --- |
| Kho `ACTIVE` | `E094` | `E094` |
| NCC tồn tại, chưa xoá mềm | `E019` | — (đã xác định ở header) |
| `items[]` không rỗng | `E182` | `E185` |
| Không trùng dòng trong payload | `E183` (`productionJobOperationId`) | `E186` (`outsourcingOrderItemId`) |
| `productionJobOperationId` tồn tại, snapshot `type = OUTSOURCE` | `E166` (mỗi dòng) | — |
| `productionJob.status = IN_PROGRESS` | `E167` (mỗi dòng) | — |
| BOM node snapshot suy được `itemId` | `E168` (mỗi dòng) | — |
| SL gửi (cộng dồn) không vượt định mức Job | `E184` (2 lượt: mềm trước insert, chốt thật trên dữ liệu vừa insert) | — |
| Đủ tồn kho gửi/nhận | `E106` | — |
| OS-OUT nguồn tồn tại, đang `POSTED` | — | `E165`/`E171` (mỗi dòng) |
| NCC của dòng OS-OUT khớp `supplierId` header | — | `E187` (mỗi dòng) |
| SL nhận (cộng dồn theo dòng OS-OUT) không vượt SL gửi | — | `E172` (2 lượt: mềm trước insert, chốt thật trên dữ liệu vừa insert) |
| Còn OS-IN chưa `CANCELLED` (chặn `cancel` OS-OUT) | *(xem `cancel`)* | — |
| Đã có IQC trỏ vào (chặn `cancel` OS-IN) | — | *(xem `cancel`)* |

## Flow

### Lập + gửi OS-OUT

1. (Tuỳ chọn) `GET /outsourcing-orders/outsourceable-operations` — dựng popup chọn part: mỗi dòng
   là một `production_job_operations.type = OUTSOURCE` của Job `IN_PROGRESS`, kèm `plannedQuantity`
   (`resolvePlannedQuantities`, tính trong JS vì phụ thuộc cây BOM, không phải một câu SQL phẳng) và
   `sentQuantity`/`remainingQuantity` (SUM `outsourcing_order_items` cùng `productionJobOperationId`,
   trạng thái `POSTED`) — chỉ tính cho đúng trang đã phân trang ở SQL, không phải toàn bộ ứng viên.
2. `createOutsourcingOrder` — validate từng dòng **trước** khi mở transaction (bảng Preconditions,
   lượt mềm), suy `itemId`/`productionJobId`/`operationCode`/`operationName` từ
   `production_job_operations`/`production_job_bom_items`, snapshot `plannedQuantity`/
   `sentBeforeQuantity` lúc tạo (chỉ để hiển thị/in — không dùng lại để validate). Sinh mã
   `OS-OUT-{đếm+1, pad 4}`, rồi trong **một** transaction: `INSERT` header thẳng `status = POSTED`
   (`postedBy`/`postedAt` set ngay) + `INSERT` mọi dòng (`.returning()` lấy lại dữ liệu vừa ghi) →
   **validate `E184` lần hai trên dữ liệu vừa insert** (chốt chặn thật, loại chính phiếu đang tạo
   khỏi SUM — bắt buộc, xem `docs/decisions/outsourcing-no-draft.md`) → với mỗi dòng gọi
   `InventoryPostingService.postDocument(tx, { referenceType: OUTSOURCING_ORDER, lines: [{ itemId,
   signedQuantity: -quantity, type: ISSUE }] })` (không gộp các dòng cùng `itemId`, mỗi dòng phiếu
   sinh đúng một bút toán).

### Lập + nhận OS-IN (lặp lại nếu nhận nhiều đợt)

3. (Tuỳ chọn) `GET /outsourcing-receipts/pending-order-items` — dựng popup chọn hàng cần nhận: mỗi
   dòng là một `outsourcing_order_items` thuộc phiếu `POSTED`, kèm `weight`/`area` của dòng gốc làm
   giá trị mặc định cho form nhập.
4. `createOutsourcingReceipt` — validate từng dòng (lượt mềm): OS-OUT nguồn tồn tại + `POSTED`
   (`E165`/`E171`), NCC của dòng khớp `supplierId` header (`E187`), trần SL sớm theo từng dòng (`Σ`
   OS-IN `POSTED` hiện có + SL mới ≤ SL gửi của dòng OS-OUT, `E172`). `itemId` copy từ dòng OS-OUT,
   sinh mã `OS-IN-{đếm+1, pad 4}`, rồi trong **một** transaction: `INSERT` header thẳng
   `status = POSTED` + `INSERT` mọi dòng (`.returning()`) → **kiểm lại trần SL theo từng dòng** (chỉ
   tính OS-IN `POSTED`, loại trừ chính phiếu đang tạo — chốt chặn thật) → với mỗi dòng gọi
   `postDocument(tx, { referenceType: OUTSOURCING_RECEIPT, lines: [{ itemId,
   signedQuantity: +quantity, type: RECEIPT }] })` → nếu `requiresIqc`, gọi
   `IqcService.createInspectionsFromOutsourcingReceipt(tx, {...})` — sinh **N dòng**
   `iqc_inspections` (`NOT_INSPECTED`, 1/dòng phiếu OS-IN), **không** gate transaction này (hàng đã
   về kho vật lý ở bước `postDocument` ngay trước đó).

### QC (chỉ khi `requiresIqc = true`)

5. Từ đây đúng luồng `POST /iqc/:iqcId/confirm` đã có, chạy **độc lập cho từng dòng IQC** — QC chọn
   `result`/`disposition` riêng cho mỗi dòng. `result = PASS` hoặc `disposition = CONCESSION` →
   `COMPLETED` ngay. `result = FAIL` + `disposition = SORT`/`RETURN` → `WAITING_RETURN`, tự sinh
   `supplier_returns` (`DRAFT`, `outsourcingReceiptId` trỏ về header OS-IN — **không** trỏ dòng cụ
   thể, `iqcId` mới là chỗ trace về đúng dòng) — `resolveReturnWarehouseId` suy kho trả từ
   `outsourcingReceipt.warehouseId` (nguồn thứ 2 trong 3, xem `docs/domains/quality.md`).
6. `postSupplierReturn` — đúng khuôn `docs/workflows/supplier-return.md`, nhưng
   **`shouldPostStock` luôn `true`** ở nhánh này: `inventoryReceiptId` của dòng `supplier_returns`
   sinh ra từ OS-IN luôn `null` (không phải trace về phiếu nhập mua), và điều kiện "bỏ qua nếu
   phiếu nhập gốc chưa `POSTED`" chỉ áp dụng khi có `inventoryReceiptId` — hàng OS-IN đã thật sự
   vào kho ở bước 4 nên trừ tồn ngay là đúng, không có ca "hàng chưa từng vào tồn" như
   IQC-trên-phiếu-nhập.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `outsourcing_orders` + `outsourcing_order_items` | `create` | *(chưa có)* | 1 header `POSTED` + N dòng |
| `inventory_balances`/`inventory_transactions` | `create` OS-OUT | — | trừ tồn kho gửi (`ISSUE`, 1 bút toán/dòng) |
| `outsourcing_orders.status` | `cancel` | `POSTED` | `CANCELLED` |
| `outsourcing_receipts` + `outsourcing_receipt_items` | `create` | *(chưa có)* | 1 header `POSTED` + N dòng |
| `inventory_balances`/`inventory_transactions` | `create` OS-IN | — | cộng tồn kho nhận (`RECEIPT`, 1 bút toán/dòng) |
| `iqc_inspections` | `create` OS-IN (nếu `requiresIqc`) | *(chưa có)* | N dòng `NOT_INSPECTED` (1/dòng phiếu) |
| `outsourcing_receipts.status` | `cancel` | `POSTED` | `CANCELLED` |
| ...(từ đây giống `docs/workflows/supplier-return.md`, "State changes") | | | |

## Side effects

- `create` OS-OUT/OS-IN: 1 bút toán cho mỗi dòng phiếu, không side effect nào khác ngoài IQC.
- `create` OS-IN với `requiresIqc = true`: thêm N dòng `iqc_inspections` (bằng số dòng phiếu OS-IN),
  mã `IQC-{năm}-xxxxx` — dùng chung bộ đếm với IQC sinh từ phiếu nhập mua (cùng bảng, cùng hàm
  `generateIqcCodes`, sinh N mã liên tiếp trong một lượt).
- Nhánh QC (nếu FAIL + SORT/RETURN): xem "Side effects" ở `docs/workflows/supplier-return.md` —
  không có gì khác nguồn OS-IN so với nguồn phiếu nhập mua từ bước `confirm` IQC trở đi.

## Transaction boundary

Các transaction rời theo từng route, không transaction nào bắc cầu quá 2 module:

1. `createOutsourcingOrder` — `outsourcing_orders`/`outsourcing_order_items` +
   `InventoryPostingService` (module `inventory`), validate mềm chạy **trước** khi mở transaction.
2. `createOutsourcingReceipt` — `outsourcing_receipts`/`outsourcing_receipt_items` +
   `InventoryPostingService` + (tuỳ chọn) `IqcService.createInspectionsFromOutsourcingReceipt`
   (module `iqc`, gọi trực tiếp qua DI — `OutsourcingReceiptsModule` import `IqcModule`; chiều
   ngược lại không tồn tại, `IqcService` đọc bảng `outsourcing_receipts` thẳng qua `tx`, không cần
   DI ngược nên **không** phát sinh vòng lặp module như cặp `IqcModule`/`SupplierReturnsModule`).
3. `confirmIqc` — `iqc_inspections` + `SupplierReturnsService.createFromIqcDisposition` (đã có từ
   trước, không đổi cơ chế).
4. `postSupplierReturn` — `supplier_returns` + `InventoryPostingService` +
   `completeIqcAfterSupplierReturn` (plain function, như luồng gốc).

Sinh mã (`OS-OUT-xxxx`/`OS-IN-xxxx`) nằm **ngoài** transaction — khác `PTNCC`/`IQC` (sinh trong
transaction `confirm`, vì đi kèm ghi khác cùng transaction đó). Cùng giới hạn đếm-rồi-cộng đã chấp
nhận chung trong repo — hai lượt `create` song song có thể trùng mã, unique constraint trên `code`
là chốt chặn thật; transaction `create` giờ dài hơn trước (thêm bước trừ/cộng tồn + IQC), cửa sổ
race này vì vậy rộng hơn một chút so với trước khi gộp `post` vào `create`, vẫn chấp nhận được vì
unique constraint là chốt thật, không phải chốt duy nhất.

## Failure cases

`E094` (kho `INACTIVE`), `E019` (NCC không tồn tại), `E098` (`cancel` gọi trên phiếu đã
`CANCELLED` — không còn xảy ra ở `create` vì không còn trạng thái nguồn nào để sai), `E106` (thiếu
tồn khi `create` OS-OUT/OS-IN — mới xuất hiện ở `create` từ khi gộp `post` vào, trước đây chỉ có ở
bước `post` riêng), `E165`/`E170` (không tìm thấy OS-OUT/OS-IN), `E166` (công đoạn không phải
`OUTSOURCE`), `E167` (Job không `IN_PROGRESS`), `E168` (BOM node snapshot mất `itemId`), `E169`
(huỷ OS-OUT còn OS-IN chưa `CANCELLED`), `E171` (tạo dòng OS-IN khi OS-OUT nguồn đã `CANCELLED`),
`E172` (SL nhận vượt SL gửi của dòng), `E173` (huỷ OS-IN đã có IQC trỏ vào), `E182`/`E185`
(`items[]` rỗng), `E183`/`E186` (trùng dòng trong payload), `E184` (gửi vượt định mức Job), `E187`
(dòng OS-OUT khác NCC với header OS-IN). Nhánh QC (nếu có) dùng lại nguyên bộ lỗi ở
`docs/workflows/supplier-return.md`.

## Business rules

- Vì sao OS-OUT bắt buộc mỗi dòng gắn `productionJobOperationId` của một Job `IN_PROGRESS`, vì sao
  chặn gửi vượt định mức, và vì sao không ép nhóm NCC → `docs/domains/inventory.md`.
- Vì sao IQC trên OS-IN không gate `create` (khác phiếu nhập mua), và vì sao `shouldPostStock` luôn
  đúng cho nhánh này → `docs/domains/inventory.md`, "Gia công ngoài" ở Cross-domain dependencies.
- Quy tắc suy `status`/`disposition` của một dòng IQC, không đổi gì cho nguồn OS-IN →
  `docs/domains/quality.md`.
- Vì sao không còn bước nháp, route nào bị bỏ, và điều gì không nên hoàn lại →
  `docs/decisions/outsourcing-no-draft.md`.
- **Chưa có** gating/block tiến độ Job hay công đoạn kế tiếp theo trạng thái OS-OUT/OS-IN — để đợt
  sau, xem `docs/domains/production.md`.
- **Chưa có** xuất Excel, in PDF/QR, hay endpoint dữ liệu in phiếu — chỉ có `GET` list/detail trả
  JSON đầy đủ cột; in phiếu (nếu làm) là việc của đợt sau.

## Related domains

`inventory` (chủ cả hai chứng từ) ↔ `production` (đọc-một-chiều, anchor, cả `production_job_operations`
lẫn `resolvePlannedQuantities`) ↔ `quality` (tuỳ chọn, tự sinh N dòng khi `requiresIqc`). Không đụng
`purchasing`/`suppliers` ngoài việc `outsourcing_orders.supplierId`/`outsourcing_receipts.supplierId`
trỏ `suppliers` (thuần FK, không validate nhóm).

Bước trước: `production_job_operations` snapshot `type = OUTSOURCE` đã có sẵn từ lúc duyệt LSX
(`docs/domains/production.md`) — không phải bước của luồng này, chỉ là điều kiện cần.
Bước sau: nếu có nhánh QC FAIL + SORT/RETURN, tiếp tục đúng
`docs/workflows/supplier-return.md` từ bước `post` phiếu trả.

Code: `OutsourcingOrdersService`, `OutsourcingReceiptsService`,
`src/api/outsourcing-orders/outsourcing-orders.query.ts#getSentQuantityByJobOperationIds`,
`src/api/outsourcing-receipts/outsourcing-receipts.query.ts#getReceivedQuantityByOrderItemIds`,
`IqcService.createInspectionsFromOutsourcingReceipt`,
`src/api/production-jobs/production-jobs.util.ts#resolvePlannedQuantities`.
