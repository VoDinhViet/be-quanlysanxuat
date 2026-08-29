# Thêm gate QC vào luồng xuất kho sản xuất + giao hàng

**Trạng thái:** còn hiệu lực — đảo một phần quyết định cũ "không gate xuất kho sản xuất".

## Bối cảnh

Trước đợt này, IQC chỉ gate một điểm: `POST /inventory-receipts/:id/post` chặn (`E153`) khi phiếu
đang `PENDING_IQC` mà còn phiếu IQC nào chưa `COMPLETED`. Không có gate nào ở luồng **xuất** vật tư
cho sản xuất hay ở luồng **giao hàng**. Lý do gốc (ngầm định): "hàng NG chưa từng vào tồn — `E153`
đã chặn từ đầu vào, nên không cần chặn lại ở đầu ra." Rà lại khi thiết kế OQC lộ ra lý do đó **không
còn đúng hoàn toàn** — 3 lỗ hổng thật: (1) phiếu nhập `requiresIqc=false` không qua `E153`; (2) IQC
tạo tay hậu kiểm trên hàng đã vào tồn (`E153` chỉ chạy lúc `post`, không chạy lại khi có IQC tạo
sau); (3) IQC từ OS-IN không gate `create` (gia công ngoài không đụng `inventory_balances`, nên
không có cổng `E153`-style). Cả ba dẫn tới cùng rủi ro: vật tư chưa qua IQC (hoặc IQC FAIL chưa xử
lý) vẫn có thể bị xuất cho sản xuất; thành phẩm lỗi (OQC FAIL chưa xử lý) không có gì chặn giao khách.

## Quyết định

Thêm 2 gate mới, không sửa gate `E153` đang có:

- **Gate D1 (IQC → xuất kho sản xuất):** `InventoryIssuesService.postInventoryIssue`
  (`issueType=PRODUCTION` only) chặn (`E203`) nếu còn ≥1 phiếu IQC chưa `COMPLETED` của cùng
  `(itemId, warehouseId)` — `hasPendingIqcForItems`. Đặt ở `post`, không phải `create`, vì `post`
  mới là lúc hàng thật rời kho.
- **Gate D2 (QC → giao hàng):** `POST /outbound-orders/:id/send` (`DRAFT`/`REJECTED →
  PENDING_APPROVAL`) chặn (`E205`) nếu còn Job nào (qua `outbound_order_items.productionJobId`)
  chưa qua hết QC — `getJobQcCoverage`, cùng gate `E196` (`docs/decisions/qc-data-model.md`). Phủ cả
  OQC (công đoạn `INHOUSE`) lẫn IQC sinh từ OS-IN (công đoạn `OUTSOURCE`). Dòng OQC
  `disposition=SCRAP` không được tính là "đã QC xong" dù `COMPLETED`.

**Đường gỡ đi kèm gate D1:** `DELETE /iqc/:iqcId` (chỉ khi `DRAFT`, `E206`) — cần một cách
gỡ phiếu IQC tạo nhầm mà không phải chờ QC "confirm cho qua" một phiếu không nên tồn tại.

## Giới hạn chấp nhận của gate D1

IQC không có cột kho riêng — suy qua `inventoryReceipt.warehouseId`. Phiếu IQC tạo tay hoặc từ
OS-IN không suy được kho thì **bỏ qua, không chặn** — tránh khoá vĩnh viễn luồng xuất khi không truy
được ngữ cảnh, đổi lại D1 không phủ 100% trường hợp. Gate chặn theo `(item, kho)`, không theo lô cụ
thể — không có lot tracking, có thể chặn nhầm tồn tốt cùng item/kho khác lô đang FAIL. Đã xác nhận
với user, không phải bug bỏ sót.

## Phạm vi cố ý hẹp của gate D2

`send` chỉ dừng ở `PENDING_APPROVAL` — không trừ tồn. Việc trừ tồn nằm ở `deliver`
(`docs/workflows/outbound-delivery.md`, `docs/decisions/production-lifecycle-closing.md`).

## Giữ nguyên, không đổi

`E153` không sửa — D1/D2 là bổ sung, không thay thế. Mọi route/gate khác không thuộc
`issueType=PRODUCTION`/`send` DO không đụng tới.

## Related docs

`docs/decisions/oqc-per-operation.md`, `docs/decisions/qc-data-model.md` (`getJobQcCoverage`),
`docs/decisions/quality-schema-rename.md` (đổi tên bảng/cột QC, 2026-08),
`docs/decisions/production-lifecycle-closing.md`, `docs/domains/quality-iqc.md`,
`docs/domains/quality-oqc.md`, `docs/workflows/outgoing-qc.md`, `docs/workflows/outbound-delivery.md`.
