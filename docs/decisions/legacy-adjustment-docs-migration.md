# Di chuyển 8 phiếu ADJUSTMENT cũ ra khỏi chuỗi migration dùng chung

**Trạng thái:** còn hiệu lực

## Bối cảnh

Trước khi tách `inventory_adjustments` thành module riêng (`docs/decisions/single-warehouse.md` là
migration đi kèm), `receipt_type`/`issue_type` từng có giá trị `ADJUSTMENT`. Production có 8 phiếu
loại này (7 `inventory_receipts` + 1 `inventory_issues`), tất cả là dữ liệu test (note đều có
`[TEST]`), tạo bởi cùng 1 user trong 18-24/08/2026. Migration `0169` cần xoá giá trị `ADJUSTMENT`
khỏi 2 enum này, nên 8 phiếu phải chuyển đi trước — không thể xoá thẳng vì `PNK-2026-00019` (đã
`POSTED`) đã cộng tồn "Bàn làm việc" mà các phiếu xuất thật sau đó (25-28/08) đã tiêu thụ hết; xoá/
đảo phiếu sẽ đẩy tồn kho xuống âm.

## Quyết định

Chạy 1 lần trực tiếp lên production (2026-08-31, không lặp lại): INSERT 8 dòng vào
`inventory_adjustments`/`inventory_adjustment_items` (giữ nguyên số liệu, trạng thái, ghi chú gốc,
tiền tố `PDC-2026-0000X`), UPDATE lại `inventory_transactions.reference_type`/`reference_id` của 6
phiếu đã `POSTED` trỏ sang bản ghi `inventory_adjustments` mới (**không** đảo dấu — giữ nguyên hiệu
ứng tồn kho), rồi xoá 8 phiếu gốc + dòng của chúng, và seed `document_sequences` cho
`INVENTORY_ADJUSTMENT`/2026 = 8 để phiếu điều chỉnh thật đầu tiên tiếp tục từ `PDC-2026-00009`.

Nội dung trên **không nằm trong `drizzle/0169_*.sql`** — nó tham chiếu id item/user chỉ tồn tại
trên production; nếu để trong migration dùng chung, `pnpm db:migrate` trên dev/máy mới/CI sẽ vỡ FK
ngay ở câu INSERT đầu tiên. `0169` trong repo chỉ còn phần DDL/backfill tổng quát (xoá bảng
`warehouses`, thu hẹp enum, backfill `unit_id`) — an toàn chạy ở mọi môi trường.

Do tách ra khỏi migration, dev (đã áp bản `0168` gộp — trước khi bị tách thành `0168`+`0169`) được
ghi nhận thủ công là đã áp `0169` (chỉ insert 1 dòng vào `drizzle.__drizzle_migrations`, không đụng
schema/data — schema dev từ bản gộp đã khớp `0169` sẵn).
