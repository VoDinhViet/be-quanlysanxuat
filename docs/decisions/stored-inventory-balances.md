# Tồn kho chuyển sang lưu trữ (đảo `docs/domains/inventory.md`)

**Trạng thái:** còn hiệu lực — đảo ngược một quyết định kiến trúc trung tâm trước đó

## Bối cảnh

Tới trước feature này, tồn kho **không được lưu ở bất kỳ đâu** — mọi con số `onHand` tính lại từ
`stock_receipt_items` ở mỗi lần đọc. Đó là quyết định kiến trúc trung tâm của domain `inventory`,
nêu rõ ở phiên bản cũ của `docs/domains/inventory.md`: *"mọi hướng mở rộng sau này (nhiều kho, khoá
sổ, giữ hàng thủ công) đều là cộng thêm, không phải migrate lại số tồn đã lưu"*.

Người dùng yêu cầu thiết kế lại domain kho theo mô hình kho vật lý: danh mục `warehouses`, phiếu
nhập/xuất có vòng đời `DRAFT`/`POSTED`/`CANCELLED`, sổ cái `inventory_transactions`, và bảng tồn
`inventory_balances`. Yêu cầu này **đảo ngược thẳng** câu trên.

## Quyết định

**Tồn kho giờ có lưu — `inventory_balances` là một bảng thật, một dòng mỗi (kho × mặt hàng).**

- `inventory_transactions` (sổ cái, append-only) là **nguồn sự thật**. `inventory_balances` là
  **bản chiếu** của sổ cái — dựng lại được 100% bằng cách cộng dồn mọi bút toán theo
  `(warehouseId, itemId)`, nên không mất khả năng phục hồi nếu số dư bị lệch.
- `stock_receipts`/`stock_receipt_items` — hai bảng phiếu cũ gánh cả nhập lẫn xuất qua cặp
  `subject`+`type`+`reason` — bị **xoá hẳn**, cùng 5 route `/stock-receipts` và 9 `ErrorCode`
  (`E067`–`E073`, `E085`, `E086`, xem `src/constants/error-code.constant.ts`).
- Phiếu tách đôi thành `inventory_receipts`/`inventory_issues`, có vòng đời
  `DRAFT → POSTED → CANCELLED`. **Chỉ `POSTED` mới ghi `inventory_transactions` và đụng
  `inventory_balances`** — phiếu `DRAFT` không ảnh hưởng tồn kho, khác hẳn phiếu cũ (ghi ngay lúc
  tạo, không có vòng đời).

## Cái mất

- Mã phiếu gộp `PN`/`PX`/`PNVT`/`PXVT` theo `subject` — thay bằng `PNK`/`PXK` theo năm.
- Cặp `subject`/`reason` ràng buộc bằng CHECK DB — thay bằng `receiptType`/`issueType` không còn
  ràng buộc chéo với kho (xem dưới).
- Soft delete trên phiếu (`stock_receipts.deletedAt`) — phiếu mới hard-delete được khi còn `DRAFT`,
  `CANCELLED` đã đóng vai trò "phiếu bỏ" nên không cần thêm cơ chế xoá mềm chồng lên.
- Danh sách 8 bảng có `deletedAt` ở `.claude/rules/database.md` mất một bảng, còn lại 7.

## Cái được

- **Chặn âm kho ở tầng DB thật** — CHECK `chk_inventory_balances_quantity_non_negative` trên chính
  cột lưu, không phải một quy tắc chỉ tồn tại trong service. Sổ cũ ghi rõ giới hạn này *"không có
  constraint DB nào chặn được điều này (tồn là số tính lại, không phải cột) — giới hạn đã biết,
  chưa xử lý"*; thiết kế mới xử lý được nhờ `SELECT … FOR UPDATE` khoá đúng dòng balance trong
  transaction `post`, không còn race hai phiếu xuất song song cùng vượt tồn.
- **Một `itemId` NOT NULL duy nhất** trên cả ledger lẫn balances — ban đầu đợt này dùng cặp
  `itemType` + `productId`/`materialId` nullable + CHECK (đúng khuôn `bom_items` lúc đó), sau co lại
  còn một `itemId` khi `products`/`materials` gộp thành `items`, xem
  `docs/decisions/items-merge.md`.
- **Loại kho không ràng buộc cứng với loại hàng** — `warehouses.type` (`RM`/`FG`/`WIP`) là nhãn
  phân loại/lọc, không phải constraint; một kho `RM` vẫn nhận được thành phẩm nếu người dùng muốn.
  Quyết định nghiệp vụ, không phải giới hạn kỹ thuật.

## Ngoài phạm vi đợt này

- Auto-post kho từ sản xuất (`ProductionJobsService.startJob` xuất vật tư, Job hoàn thành nhập
  thành phẩm) — vẫn ngoài phạm vi, dù chặn kỹ thuật gốc (`ProductionJobStatus` chưa có trạng thái
  hoàn thành) đã được gỡ (`docs/decisions/production-lifecycle-closing.md`). Job `COMPLETED` giờ
  suy ra **từ** phiếu nhập TP đã `post` đủ SL — chưa đảo ngược lại thành "Job xong tự lập phiếu".
  Phiếu nhập/xuất vẫn có cột liên kết `productionOrderId`/`productionJobId`.
- Chuyển kho (`TRANSFER_IN`/`TRANSFER_OUT` có trong enum nhưng chưa route nào phát ra), quản lý lô/
  vị trí (không `locationId`/`batchId`). `reservedQuantity` thành cột thật vẫn ngoài phạm vi — cột
  `inventory_balances.reserved_quantity` luôn `0` dưới DB — nhưng **đã đảo một phần**:
  `GET /inventory/balances.reservedQuantity` giờ trả số tính động thay vì literal `0`, và `reserved`
  của thành phẩm trên `GET /inventory-products` không còn tính thuần từ `order_items` — giờ là
  chứng từ giữ (DO `PENDING_APPROVAL`/`PENDING_DELIVERY`). Xem `docs/domains/inventory.md`.
- **Chưa phân biệt chủ sở hữu** — khoá dòng vẫn đúng một cặp `(warehouseId, itemId)`, không có
  chiều thứ ba. Hàng khách gửi (`inventory_receipts.clientId`, `receiptType = RETURN`) và hàng công
  ty mua cùng item/kho cộng chung vào một số `quantity` — biết đây là giới hạn thật (xác nhận có dữ
  liệu dev bị gộp), cân nhắc tách theo `clientId` rồi quyết định **chưa làm** vì đụng toàn bộ luồng
  ghi/đọc tồn (posting engine, gate IQC, lãnh vật tư, các màn tồn kho). Traceability hiện chỉ ở mức
  chứng từ, không ở mức số tồn — xem `docs/domains/inventory.md`.

## Không nhầm với

`docs/decisions/purchasing-scope-limits.md` — đợt này **nới** một phần quyết định đó: phiếu nhập giờ có
`unitPrice` (nullable) và `purchaseRequestId`, nhưng vẫn không có đơn mua hàng thật, không có bảng
giá NCC, không có công nợ. Xem cross-link ở file đó.

## Related docs

- `docs/domains/inventory.md` — mô hình mới đầy đủ.
- `docs/workflows/stock-movement.md` — trình tự lập/post/cancel phiếu.
- `docs/architecture.md` — vị trí các bảng mới trong sơ đồ ER.
