# Thêm gate QC vào luồng xuất kho sản xuất + giao hàng

**Trạng thái:** còn hiệu lực — đảo một phần quyết định cũ "không gate xuất kho sản xuất"

## Bối cảnh

Trước đợt này, IQC chỉ gate **một** điểm: `POST /inventory-receipts/:id/post` chặn (`E153`) khi
phiếu đang `PENDING_IQC` mà còn phiếu IQC nào chưa `COMPLETED`. Không có gate nào ở luồng **xuất**
vật tư cho sản xuất (`inventory-issues`, `issueType = PRODUCTION`) hay ở luồng **giao hàng**
(`outbound-orders`). Lý do gốc (ngầm định, chưa từng viết thành quyết định): "hàng NG chưa từng vào
tồn — `E153` đã chặn từ đầu vào, nên không cần chặn lại ở đầu ra."

Khi rà lại để thiết kế OQC (đợt đổi model sang gắn theo công đoạn,
`docs/decisions/oqc-per-operation.md`), lý do gốc đó được xác minh là **không còn đúng hoàn toàn** —
3 lỗ hổng thật:

1. **Phiếu nhập `requiresIqc = false` không qua `E153`** — `confirmInventoryReceipt` chỉ sinh dòng
   IQC khi `requiresIqc = true`; phiếu không bật cờ này đi thẳng `PENDING_RECEIPT`, không có gì để
   `E153` kiểm tra, hàng NG (nếu có) vẫn vào tồn bình thường.
2. **IQC tạo tay hậu kiểm trên hàng đã vào tồn** — `POST /iqc` không bắt buộc gắn
   `inventoryReceiptId`, QC có thể tạo phiếu IQC cho một lô hàng bất kỳ **sau khi** hàng đã nhập
   kho (ví dụ phát hiện lỗi lúc kiểm định kỳ) — `E153` chỉ chạy lúc `post` phiếu nhập, không chạy
   lại khi có IQC mới tạo sau đó.
3. **IQC từ OS-IN không gate `create`** — `IqcService.createInspectionsFromOutsourcingReceipt` sinh
   dòng IQC ngay trong transaction `create` của `OutsourcingReceiptsService`, **không gate** việc
   tạo phiếu (hàng đã về nhà máy vật lý trước khi IQC chạy, `docs/domains/inventory.md`) — không có
   cổng `E153`-style nào cho nhánh này vì gia công ngoài không đụng `inventory_balances`
   (`docs/decisions/wip-not-stocked.md`), nhưng vật lý hàng vẫn có thể bị lấy đi dùng cho sản xuất
   trước khi biết PASS/FAIL.

Ba lỗ hổng này đều dẫn tới cùng một rủi ro thật: vật tư chưa qua IQC (hoặc IQC FAIL chưa xử lý) vẫn
có thể bị xuất cho sản xuất. Tương tự, phía đầu ra, thành phẩm sản xuất lỗi (OQC FAIL chưa xử lý)
không có gì chặn việc giao cho khách qua `outbound-orders`.

## Quyết định

**Thêm 2 gate mới, không sửa gate `E153` đang có:**

- **Gate D1 (IQC → xuất kho sản xuất):** `InventoryIssuesService.postInventoryIssue`
  (`issueType = PRODUCTION` **only** — không áp cho `SALES`/`RETURN`/`ADJUSTMENT`) chặn (`E203`)
  nếu còn ≥1 phiếu IQC chưa `COMPLETED` của cùng `(itemId, warehouseId)` với dòng đang xuất —
  `hasPendingIqcForItems` (`src/api/iqc/iqc.query.ts`). Đặt ở `post`, không phải `create`, vì
  `post` mới là lúc hàng thật rời kho — `create` vẫn là nháp sửa được.
- **Gate D2 (QC → giao hàng):** `POST /outbound-orders/:id/confirm` (mới, `DRAFT →
  PENDING_DELIVERY`) chặn (`E205`) nếu còn Job nào (suy từ `outbound_order_items.productionJobId`,
  bỏ qua dòng `null`) chưa qua hết QC — `getJobQcCoverage`, tái dùng nguyên gate `E196`
  (`docs/decisions/oqc-per-operation.md`, `docs/decisions/qc-single-table.md`). Từ khi IQC/OQC gộp
  bảng, `getJobQcCoverage` phủ cả OQC (công đoạn `INHOUSE`) lẫn IQC sinh từ OS-IN (công đoạn
  `OUTSOURCE`) — D2 không đổi ngữ nghĩa, chỉ đổi nguồn đọc. Dòng OQC `disposition = SCRAP` không
  được `getJobQcCoverage` tính là "đã QC xong" dù đã `COMPLETED` — hàng loại bỏ không được lọt gate.

**Đường gỡ đi kèm gate D1:** thêm `DELETE /iqc/:iqcId` (chỉ khi còn `NOT_INSPECTED`, `E206`) — IQC
trước đó không có route xoá nào; một khi có gate chặn cứng luồng xuất kho theo IQC, cần một cách gỡ
phiếu IQC tạo nhầm (ví dụ tạo lộn item/kho) mà không phải chờ QC "confirm cho qua" một phiếu không
nên tồn tại.

## Cách suy kho của gate D1 — chấp nhận giới hạn

IQC không có cột kho riêng — suy qua `inventoryReceipt.warehouseId` (INNER JOIN). Phiếu IQC tạo tay
không gắn `inventoryReceiptId`, hoặc sinh từ OS-IN (không có `inventoryReceiptId` — gia công ngoài
không có khái niệm "kho nhận"), **không suy được kho thì bỏ qua, không chặn** — tránh khoá vĩnh viễn
luồng xuất kho khi không truy được ngữ cảnh, đổi lại chấp nhận gate D1 không phủ được 100% trường
hợp. Gate cũng chặn theo `(item, kho)`, không theo lô cụ thể — `inventory_balances` không có lot
tracking, có thể chặn nhầm tồn tốt cùng item/kho nhưng khác lô với lô đang FAIL. Cả hai giới hạn này
đã xác nhận với user, không phải bug bỏ sót.

## Phạm vi cố ý hẹp của gate D2

`POST /outbound-orders/:id/confirm` chỉ dừng ở `PENDING_DELIVERY` — chưa làm `DELIVERED`, chưa trừ
tồn, chưa sinh `inventory_issues` (SALES). Đó là phase giao hàng 2, chưa thiết kế
(`docs/domains/inventory.md`, mục "Giao hàng", Common mistake #22).

## Giữ nguyên, không đổi

- `E153` (gate nhập kho theo IQC) — không sửa, gate D1/D2 là **bổ sung**, không thay thế.
- Mọi route/gate khác của `inventory-issues`/`outbound-orders` không thuộc `issueType = PRODUCTION`/
  route `confirm` — không đụng tới.

## Related docs

`docs/decisions/oqc-per-operation.md` (gốc gate theo công đoạn). `docs/decisions/qc-single-table.md`
(`getJobQcCoverage` dùng chung ở gate D2, sau khi IQC/OQC gộp bảng). `docs/domains/quality.md`,
`docs/domains/inventory.md`, `docs/workflows/stock-movement.md`.
