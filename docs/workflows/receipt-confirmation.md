# Xác nhận phiếu nhập kho & cổng IQC

Chặng giữa của một phiếu nhập: từ lúc lập `DRAFT` tới lúc `post` ghi tồn thật. Mô hình phiếu/vòng đời
chung ở `docs/domains/inventory.md`; đây là trình tự đầy đủ riêng cho nhánh `confirm`/IQC. `post`/
`cancel` dùng chung với phiếu xuất, xem `docs/workflows/stock-movement.md`.

## Trigger

- `POST /inventory-receipts/:receiptId/confirm` — xác nhận phiếu, chuyển khỏi `DRAFT` *(một lần)*.
- `POST /inventory-receipts/:receiptId/post` — ghi tồn *(một lần, sau khi đã `confirm`)*.
- Chỉ khi `requiresIqc = true` lúc lập phiếu: `POST /iqc/:iqcId/confirm` (nút "Lưu" duy nhất của
  IQC — QC chọn PASS/FAIL và, nếu FAIL, cả phương án xử lý cùng lúc) trên từng phiếu IQC được sinh
  ra — route này thuộc domain `quality`, xem `docs/domains/quality.md`. Nếu disposition ra SORT/
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

| Điều kiện | `confirm` | `post` (từ `PENDING_RECEIPT`) | `post` (từ `PENDING_IQC`) |
| --- | --- | --- | --- |
| Phiếu tồn tại | `E096` | `E096` | `E096` |
| Đúng trạng thái nguồn | `E098` (phải `DRAFT`) | `E098` (phải `PENDING_RECEIPT`) | `E098` (phải `PENDING_IQC`) |
| Có ≥ 1 dòng | `E151` | — (đã chặn từ `confirm`) | — |
| SL cộng dồn không vượt SL đặt của dòng PO | `E154` | — (đã chặn từ `confirm`) | — |
| `requiresIqc=true` phải suy được `supplierId` | `E152` | — | — |
| Mọi phiếu IQC gắn với phiếu đã `COMPLETED` | — | — | `E153` |

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
   - `true`: suy `supplierId = receipt.supplierId ?? purchaseOrder.supplierId` (đọc PO nếu có) —
     không suy được → `E152`. Gọi `IqcService.createInspectionsFromReceipt(tx, {...})`: một
     `INSERT` duy nhất sinh N dòng `qc_requests` (`kind = INCOMING`, N = số dòng phiếu), mỗi
     dòng
     `status = NOT_INSPECTED`, `result`/`disposition` `NULL`, mã cấp theo lô qua
     `generateIqcCodes` (không lặp gọi hàm sinh mã đơn — xem `docs/domains/quality.md`, Common
     mistakes #5). `status = PENDING_IQC`.
5. Cập nhật `status` header. Không đụng tồn kho, không sinh bút toán.

### `post` — nhánh `PENDING_IQC`

Trong cùng khoá `SELECT … FOR UPDATE` của `post` (`docs/workflows/stock-movement.md`): đếm
`qc_requests` (`kind = INCOMING`) gắn với phiếu, nếu **không có dòng nào** hoặc còn dòng
`status !== COMPLETED` →
`E153`, dừng trước khi chạm `inventory_balances`. Qua được thì `post` chạy y hệt nhánh
`PENDING_RECEIPT` — không phân biệt gì thêm ở bước ghi bút toán.

Muốn một dòng IQC đạt `COMPLETED` phải đi qua `POST /iqc/:iqcId/confirm` với `result = PASS` (ngay
`COMPLETED`), hoặc `result = FAIL` + `disposition = CONCESSION` (ngay `COMPLETED`), hoặc `result =
FAIL` + `disposition = SORT`/`RETURN` — dừng ở `WAITING_RETURN` trước, chỉ `COMPLETED` sau khi
phiếu trả NCC tự sinh cho dòng đó được kho `post` (`docs/workflows/supplier-return.md`). Tức là
hàng phải trả/phân loại vẫn chặn `post` phiếu nhập này **cho tới khi** kho xác nhận xuất trả xong —
không tự động. Xem `docs/domains/quality.md`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `inventory_receipts.status` | `confirm` | `DRAFT` | `PENDING_RECEIPT`/`PENDING_IQC` |
| `qc_requests` (`kind = INCOMING`) | `confirm` (`requiresIqc=true`) | *(chưa có)* | N dòng `NOT_INSPECTED` |
| `qc_requests.status` | `POST /iqc/:id/confirm` | theo `docs/domains/quality.md` | — |
| `inventory_receipts.status` | `post` | `PENDING_RECEIPT`/`PENDING_IQC` | `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` | — | cập nhật (xem `docs/workflows/stock-movement.md`) |

## Side effects

- `confirm` với `requiresIqc=true`: N dòng `qc_requests` mới, mã liên tiếp cùng năm
  (`IQC-{năm}-xxxxx`). Không side effect nào khác ngoài đổi `status` phiếu.
- `post` từ `PENDING_IQC` không đụng gì tới `qc_requests` — chỉ đọc để kiểm điều kiện,
  không ghi.

## Transaction boundary

`confirm` mở transaction bao **hai module**: `inventory_receipts` (khoá + đổi `status`) và
`qc_requests` (insert hàng loạt khi có QC) — lý do `IqcService.createInspectionsFromReceipt`
bắt buộc nhận `tx`, không tự mở transaction (`.claude/rules/transactions.md`, cùng khuôn
`PurchaseOrdersService.createDraftOrdersFromQuotation` ở `docs/workflows/rfq-approval.md`). `post`
đọc `qc_requests` **trong** transaction của chính nó (đã khoá phiếu nhập, không cần khoá
thêm dòng IQC — dòng IQC không bị `post` phiếu nhập ghi lại) rồi mới quyết định có ghi
`inventory_balances`/`inventory_transactions` hay không.

Sinh mã IQC hàng loạt nằm **trong** transaction `confirm`: một câu cấp luôn N số liên tiếp qua bảng
đếm dùng chung `document_sequences` (`docs/architecture.md`, mục "Bất biến xuyên module") — atomic,
hai lượt `confirm` song song không thể ra cùng mã.

## Failure cases

Xem bảng đầy đủ ở `docs/workflows/stock-movement.md` — file đó gộp chung cả nhập lẫn xuất. Tóm tắt
các mã riêng của luồng này: `E151` (confirm phiếu rỗng dòng), `E152` (confirm yêu cầu IQC nhưng
thiếu NCC), `E153` (post khi IQC chưa xong), `E154` (SL cộng dồn vượt SL đặt PO, kiểm ở cả
`create`/`update`/`confirm`).

## Business rules

- Vì sao 2 trạng thái mới dùng chung enum với phiếu xuất thay vì tách bảng riêng, vì sao không có
  transition tự động `PENDING_IQC → PENDING_RECEIPT` → `docs/domains/inventory.md`.
- Quy tắc suy `status` của một dòng IQC (`result`/`disposition` → `NOT_INSPECTED`/`PENDING`/
  `WAITING_RETURN`/`COMPLETED`) → `docs/domains/quality.md`.

## Related domains

`inventory` (chủ) → `quality` (một chiều, chỉ lúc `confirm` với `requiresIqc=true`; `post` đọc lại
`qc_requests` nhưng không ghi). `quality` không đọc/ghi ngược gì về `inventory_receipts`
ngoài cột trace tuỳ chọn `qc_requests.inventoryReceiptId`. Không đụng `purchasing` ở luồng
này ngoài
việc validate PO đã có sẵn từ lúc lập phiếu (`docs/domains/purchasing.md`).

Bước trước: lập phiếu `DRAFT` (`POST`/`PATCH /inventory-receipts`, không có workflow riêng — một
write đơn giản kèm validate PO, xem `docs/domains/inventory.md`). Bước sau: `cancel` (huỷ ở bất kỳ
trạng thái nào trước `CANCELLED`, xem `docs/workflows/stock-movement.md`) — không có bước nào khác
sau `post`, phiếu bất biến.

Code: `InventoryReceiptsService.confirmInventoryReceipt`/`postInventoryReceipt`,
`IqcService.createInspectionsFromReceipt`/`confirmIqc`.
