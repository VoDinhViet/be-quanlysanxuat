# Xác nhận phiếu nhập kho & cổng IQC

Chặng giữa của một phiếu nhập: từ lúc lập `DRAFT` tới lúc `post` ghi tồn thật. Mô hình phiếu/vòng đời
chung ở `docs/domains/inventory.md`; đây là trình tự đầy đủ riêng cho nhánh `confirm`/IQC. `post`/
`cancel` dùng chung với phiếu xuất, xem `docs/workflows/stock-movement.md`.

## Trigger

- `POST /inventory-receipts/:receiptId/confirm` — xác nhận phiếu, chuyển khỏi `DRAFT` *(một lần)*.
- `POST /inventory-receipts/:receiptId/post` — ghi tồn *(một lần, sau khi đã `confirm`)*.
- Chỉ khi `requiresIqc = true` lúc lập phiếu: `POST /iqc/:iqcId/confirm` (nút "Lưu" duy nhất của
  IQC — QC chọn PASS/FAIL và, nếu FAIL, cả phương án xử lý cùng lúc) trên từng phiếu IQC được sinh
  ra — route này thuộc domain `quality-iqc`, xem `docs/domains/quality-iqc.md`. Nếu disposition ra SORT/
  RETURN, `confirm` còn tự sinh một phiếu trả NCC (`supplier_returns`) — xem
  `docs/workflows/supplier-return.md`.

`requiresIqc` chốt **lúc lập phiếu** (`POST`/`PATCH /inventory-receipts`), không đổi được sau khi đã
`confirm` — phiếu `DRAFT` sửa lại `requiresIqc` thoải mái, phiếu đã qua `confirm` thì `PATCH` bị chặn
bởi `ensureReceiptDraft` như mọi field khác.

## Actor

`inventory:update` cho `confirm`/`post` (cùng quyền với `cancel`, không tách quyền duyệt riêng —
`confirm` là một bước xác nhận thao tác tay, không phải phê duyệt hai cấp). Nhánh IQC dùng
`iqc:update` (`confirm`) — người xác nhận phiếu nhập và người làm QC có thể là hai tài khoản khác
nhau, hai quyền độc lập.

## Preconditions

| Điều kiện | `create`/`update` | `confirm` | `post` (từ `PENDING_RECEIPT`) | `post` (từ `PENDING_IQC`) |
| --- | --- | --- | --- | --- |
| Phiếu tồn tại | — | `E096` | `E096` | `E096` |
| Đúng trạng thái nguồn | — | `E098` (phải `DRAFT`) | `E098` (phải `PENDING_RECEIPT`) | `E098` (phải `PENDING_IQC`) |
| `supplierId`/`clientId` không cùng có giá trị | `E253` | — | — | — |
| Có ≥ 1 dòng | — | `E151` | — (đã chặn từ `confirm`) | — |
| SL cộng dồn không vượt SL đặt của dòng PO | — | `E154` | — (đã chặn từ `confirm`) | — |
| `requiresIqc=true` phải suy được `supplierId`/`clientId` (bỏ qua khi phiếu không NCC/khách/PO nào, xem Flow) | — | `E152` | — | — |
| `receiptType=PRODUCTION`: gate OQC (`docs/workflows/outgoing-qc.md`) | — | `E179`/`E107`/`E196`/`E209`/`E197` | — | — |
| Mọi phiếu IQC gắn với phiếu đã `COMPLETED` | — | — | — | `E153` |

## Flow

### `confirm`

1. **Transaction** — khoá phiếu bằng `SELECT … FOR UPDATE` (cùng cách chống double-submit như
   `post`/`cancel`, xem `docs/workflows/stock-movement.md`), đọc kèm dòng phiếu, kiểm `DRAFT`
   (`E098`).
2. Dòng rỗng → `E151`.
3. Chạy lại kiểm SL cộng dồn không vượt SL đặt (`E154`, `docs/domains/inventory.md`) — chạy lại ở
   đây vì phiếu khác có thể đã `confirm` trong lúc phiếu này còn `DRAFT`, khoảng hở giữa lúc tạo/sửa
   và lúc `confirm`.
4. Rẽ nhánh theo `requiresIqc`:
   - `false`: `status = PENDING_RECEIPT`.
   - `true`: suy nguồn `{ supplierId, clientId } = receipt.supplierId ?? receipt.clientId ??
     purchaseOrder.supplierId` (đọc PO nếu có, `resolveIqcSourceIds` — `clientId` chỉ khi phiếu
     `RETURN` gắn khách hàng) — không suy được thì `E152`, **trừ** phiếu không NCC/khách/PO (nhập
     phát sinh khác): trả thẳng `{null, null}` thay vì chặn. Gọi
     `IqcService.createInspectionsFromReceipt(tx, {...})`: một
     `INSERT` duy nhất sinh N dòng `quality_inspections` (`inspectionType = IQC`,
     `originType = INVENTORY_RECEIPT`, N = số dòng phiếu), mỗi dòng `status = DRAFT`,
     `decision`/`disposition` `NULL`, mã cấp theo lô qua `generateIqcCodes` (không
     lặp gọi hàm sinh mã đơn — xem `docs/domains/quality-iqc.md`, Common mistakes #5). `status =
     PENDING_IQC`.
5. **Riêng `receiptType = PRODUCTION`** (`ensureProductionReceiptOqcCleared`, chạy trong cùng
   transaction, trước khi cập nhật `status` header): `productionJobId` bắt buộc (`E179`), mọi dòng
   phải `itemId = job.itemId` (`E107`), Job phải qua hết QC coverage (`E196`/`E209`), Σ `quantity`
   nhập cộng dồn ≤ `production_jobs.quantity` (`E197`) — chi tiết đầy đủ 3 kiểm này:
   `docs/workflows/outgoing-qc.md`, mục "Nhập kho thành phẩm".
6. Cập nhật `status` header + `confirmedBy`/`confirmedAt` (ghi một lần, khác `postedBy`/`postedAt`
   của bước `post`). Không đụng tồn kho, không sinh bút toán.

### `post` — nhánh `PENDING_IQC`

Trong cùng khoá `SELECT … FOR UPDATE` của `post` (`docs/workflows/stock-movement.md`): đếm
`quality_inspections` (`inspectionType = IQC`, `originType = INVENTORY_RECEIPT`) gắn với phiếu, nếu
**không có dòng nào** hoặc còn dòng `status !== COMPLETED` → `E153`, dừng trước khi chạm
`inventory_balances`. Qua được thì `post` chạy y hệt nhánh `PENDING_RECEIPT` — không phân biệt gì
thêm ở bước ghi bút toán.

Muốn một dòng IQC đạt `COMPLETED` phải đi qua `POST /iqc/:iqcId/confirm` với `result = PASS` (ngay
`COMPLETED`), hoặc `result = FAIL` + `disposition = CONCESSION` (ngay `COMPLETED`), hoặc `result =
FAIL` + `disposition = SORT`/`RETURN` — dừng ở `status = IN_PROGRESS` trước, chỉ `COMPLETED` sau khi
phiếu trả NCC tự sinh cho dòng đó được kho `post`
(`docs/workflows/supplier-return.md`). Tức là hàng phải trả/phân loại vẫn chặn `post` phiếu nhập này
**cho tới khi** kho xác nhận xuất trả xong — không tự động. Dòng IQC sinh từ phiếu `RETURN` gắn
khách hàng (`clientId`, không `supplierId`) không chọn được `disposition = SORT`/`RETURN` — `E254`,
chưa có phương án trả-lại-khách, xem `docs/domains/inventory.md` mục "Nhập từ khách hàng". Xem
`docs/domains/quality-iqc.md`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `inventory_receipts.status`/`confirmedBy`/`confirmedAt` | `confirm` | `DRAFT`/*(trống)* | `PENDING_RECEIPT`/`PENDING_IQC`/ghi 1 lần |
| `quality_inspections` (`inspectionType = IQC`) | `confirm` (`requiresIqc=true`) | *(chưa có)* | N dòng `DRAFT` |
| `quality_inspections.status` | `POST /iqc/:id/confirm` | theo `docs/domains/quality-iqc.md` | — |
| `production_jobs`/`production_orders`/`payment_requests` | `post` (nhánh `PRODUCTION`/PO) | — | cascade — xem `docs/workflows/stock-movement.md`, `docs/workflows/outgoing-qc.md` |
| `inventory_receipts.status` | `post` | `PENDING_RECEIPT`/`PENDING_IQC` | `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` | — | cập nhật (xem `docs/workflows/stock-movement.md`) |

## Side effects

- `confirm` với `requiresIqc=true`: N dòng `quality_inspections` mới, mã liên tiếp cùng năm
  (`IQC-{năm}-xxxxx`). Không side effect nào khác ngoài đổi `status` phiếu.
- `post` từ `PENDING_IQC` không đụng gì tới `quality_inspections` — chỉ đọc để kiểm điều kiện,
  không ghi.

## Transaction boundary

`confirm` mở transaction bao **hai module**: `inventory_receipts` (khoá + đổi `status`) và
`quality_inspections` (insert hàng loạt khi có QC) — lý do `IqcService.createInspectionsFromReceipt`
bắt buộc nhận `tx`, không tự mở transaction (`.claude/rules/transactions.md`, cùng khuôn
`PurchaseOrdersService.createDraftOrdersFromQuotation` ở `docs/workflows/rfq-approval.md`). `post`
đọc `quality_inspections` **trong** transaction của chính nó (đã khoá phiếu nhập, không cần khoá
thêm dòng IQC — dòng IQC không bị `post` phiếu nhập ghi lại) rồi mới quyết định có ghi
`inventory_balances`/`inventory_transactions` hay không.

Sinh mã IQC hàng loạt nằm **trong** transaction `confirm`: một câu cấp luôn N số liên tiếp qua bảng
đếm dùng chung `document_sequences` (`docs/architecture.md`, mục "Bất biến xuyên module") — atomic,
hai lượt `confirm` song song không thể ra cùng mã.

## Failure cases

Xem bảng đầy đủ ở `docs/workflows/stock-movement.md` — file đó gộp chung cả nhập lẫn xuất. Tóm tắt
các mã riêng của luồng này: `E151` (confirm phiếu rỗng dòng), `E152` (confirm yêu cầu IQC nhưng
thiếu cả NCC lẫn khách hàng), `E153` (post khi IQC chưa xong), `E154` (SL cộng dồn vượt SL đặt PO,
kiểm ở cả `create`/`update`/`confirm`), `E253` (`create`/`update` gửi cả `supplierId` lẫn `clientId`),
`E254` (`POST /iqc/:id/confirm` chọn SORT/RETURN cho dòng IQC không có `supplierId`). Gate OQC
(`E179`/`E107`/`E196`/`E209`/`E197`, chỉ `receiptType=PRODUCTION`): `docs/workflows/outgoing-qc.md`.

## Business rules

- Vì sao 2 trạng thái mới dùng chung enum với phiếu xuất thay vì tách bảng riêng, vì sao không có
  transition tự động `PENDING_IQC → PENDING_RECEIPT` → `docs/domains/inventory.md`.
- Quy tắc suy `status` của một dòng IQC (`result`/`disposition` → `DRAFT`/`PENDING`/
  `IN_PROGRESS`/`COMPLETED`) → `docs/domains/quality-iqc.md`.
- Tên bảng/cột `quality_inspections` (ex-`qc_requests`), `originType`/`originId` thay
  `inventoryReceiptId` → `docs/decisions/quality-schema-rename.md`.

## Related domains

`inventory` (chủ) → `quality-iqc` (một chiều, chỉ lúc `confirm` với `requiresIqc=true`; `post` đọc
lại `quality_inspections` nhưng không ghi) + `quality-oqc` (gate `receiptType=PRODUCTION` đọc một
chiều lúc `confirm`; **nhưng nguồn gốc chính phiếu này lại ghi ngược** — `quality-oqc.closeJobIfQcCovered`
tự sinh phiếu `PRODUCTION` `DRAFT` đầu tiên của Job, xem `docs/domains/quality-oqc.md`). Ngoài cạnh
đó, không domain QC nào khác ghi ngược về `inventory_receipts` trừ cột trace tuỳ chọn qua
`quality_inspections.originId` (khi `originType = INVENTORY_RECEIPT`). `post` còn ghi ngược
`production`/`purchasing` (xem State changes) — validate PO cơ bản đã có sẵn từ lúc lập phiếu
(`docs/domains/purchasing.md`).

Bước trước: lập phiếu `DRAFT` — hai nguồn: `POST`/`PATCH /inventory-receipts` tay (không có workflow
riêng, một write đơn giản kèm validate PO, xem `docs/domains/inventory.md`), hoặc tự sinh khi
`receiptType=PRODUCTION` (`docs/workflows/outgoing-qc.md`). Bước sau: `cancel` (huỷ ở bất kỳ
trạng thái nào trước `CANCELLED`, xem `docs/workflows/stock-movement.md`) — không có bước nào khác
sau `post`, phiếu bất biến.

Code: `InventoryReceiptsService.confirmInventoryReceipt`/`postInventoryReceipt`,
`IqcService.createInspectionsFromReceipt`/`confirmIqc`.
