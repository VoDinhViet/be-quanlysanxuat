# Xoá khái niệm WIP (bán thành phẩm)

**Trạng thái:** còn hiệu lực. Tên `PART`/`RM` dùng trong file này lúc quyết định đã đổi thành
`COMPONENT`/`CONSUMABLE` sau đó (`docs/decisions/material-to-consumable-rename.md`, 2026-09) —
bản thân quyết định "xoá WIP, tách 2 hình dạng node" ở đây **không đổi**, chỉ đổi tên vật lý; file
này dùng tên **sau** đợt đổi đó.

## Bối cảnh

`items.type` từng có 3 giá trị `FG | WIP | CONSUMABLE`. Một node BOM "cấu trúc con" (sub-assembly) bắt buộc
phải trỏ tới một dòng `items` kiểu WIP dùng chung — nghĩa là mỗi cụm lắp ráp trung gian (ví dụ
"Khung bàn", "Chân bàn") sống như một mặt hàng riêng, có mã, xuất hiện ở màn Sản phẩm, có thể tái sử
dụng ở BOM khác, và có thể có BOM/routing riêng của chính nó (đọc qua `GET /items/:wipItemId/bom`,
độc lập với vị trí nó được nhúng ở nơi khác).

Hệ thống này không quản lý bán thành phẩm như một loại mặt hàng độc lập — cấu trúc con chỉ có ý
nghĩa **thuộc về một sản phẩm cụ thể**, không cần là danh mục dùng chung.

## Quyết định

**`items.type` chỉ còn `FG | CONSUMABLE`.** Một node BOM giờ là một trong hai hình dạng, phân biệt bởi cột
mới `bom_items.type`:

- **`COMPONENT`** — thay cho WIP cũ. `itemId = NULL`, mang `code`/`name` nhập **trực tiếp** vào chính
  dòng `bom_items` đó, riêng cho vị trí đó trong cây của sản phẩm này. Không phải một dòng `items`,
  không hiện ở màn Sản phẩm/Vật tư, không tái sử dụng được ở BOM khác. Vẫn lồng được nhiều cấp
  (COMPONENT chứa COMPONENT con hoặc CONSUMABLE), vẫn gắn được công đoạn as-used qua `bom_operations`.
- **`CONSUMABLE`** — không đổi: `itemId NOT NULL` trỏ `items.id` (`type = CONSUMABLE`), luôn là lá.

CHECK `chk_bom_items_node_shape` đảm bảo đúng 1 trong 2 hình dạng trên.

**Đặt tên `COMPONENT` thay vì `ASSEMBLY`** — tránh trùng nghĩa với node Cấp 0 "final assembly" đã có sẵn
trong `production_job_bom_items`, và khớp với cách hệ thống vốn đã gọi khái niệm này ở tầng gia
công ngoài ("Mã part", `OutsourceableOperation`).

**Chu trình BOM trở thành bất khả thi về cấu trúc.** Trước kia phải kiểm (`checkNoCycle`,
`MAX_BOM_DEPTH = 50`, `BomsService`) vì một item WIP mang định danh dùng chung, có thể vừa là node
con ở một cây vừa có BOM riêng độc lập ở nơi khác — nguồn gốc duy nhất có thể sinh chu trình. Node
`COMPONENT` không còn định danh dùng chung, không thể có "BOM riêng của chính nó" ở nơi khác, nên chu
trình không còn khả năng xảy ra. `checkNoCycle`/`MAX_BOM_DEPTH` đã **xoá hẳn** khỏi `BomsService`;
`E054` (`bom_item.error.cycle_detected`) nghỉ hưu.

**`E053` (`bom_item.error.item_not_wip`) nghỉ hưu**, thay bằng `E270`
(`bom_item.error.item_not_consumable`, khi thêm node CONSUMABLE mà `itemId` không trỏ item `type=CONSUMABLE`).
Mint thêm `E271` (`bom_item.error.invalid_node_payload`, khi payload sai hình dạng theo `type`).

**`production_job_bom_items.itemType`** dùng enum riêng của chính bảng đó
(`production_job_bom_item_type = FG | COMPONENT | CONSUMABLE`), không còn dùng chung `itemTypeEnum` của `items`
(vì `items.type` giờ chỉ có 2 giá trị, không đủ chỗ cho `COMPONENT`). Tên **cột** `item_type` giữ nguyên
để đỡ đụng DTO/FE hơn mức cần.

**Gia công ngoài (`outsourcing_order_items`/`outsourcing_receipt_items`) đổi khoá.** Trước kia
`itemId NOT NULL` trỏ thẳng `items.id` — luôn là item WIP tại vị trí node đó. Vì node COMPONENT không
còn `items.id`, hai bảng này đổi sang khoá theo **`productionJobBomItemId`** (node cụ thể trong Job
cụ thể, nullable) + snapshot `itemCode`/`itemName` NOT NULL trên chính dòng — cùng khuôn
`production_job_bom_items` đã áp dụng từ trước (itemId nullable, code/name là nguồn hiển thị
chính). `itemId` giữ lại nhưng thành nullable, chỉ còn ý nghĩa tham khảo khi node là CONSUMABLE.

**QC (IQC) và trả hàng NCC cũng phải nullable `itemId` + snapshot.** IQC sinh từ phiếu nhận gia
công ngoài (OS-IN) của một node COMPONENT không còn `items.id` để gán — `quality_inspections.itemId` và
`supplier_returns.itemId` chuyển thành nullable, thêm `itemCode`/`itemName` snapshot.
`supplier_returns` thêm FK thật **`outsourcingReceiptItemId`** để khoá đúng 1 dòng OS-IN cụ thể,
thay cho cách suy mờ qua cặp `(outsourcingReceiptId, itemId)` trước đây (có thể trúng nhầm nhiều
dòng OS-IN cùng `itemId` trong 1 phiếu — một điểm mờ đã tồn tại từ trước, nay được xoá luôn cùng
đợt vì bắt buộc phải re-key).

## Vì sao

Mô hình WIP-là-item buộc mọi hệ thống hạ nguồn (gia công ngoài, QC, trả hàng NCC) phải đối xử với
một cụm lắp ráp trung gian y hệt một mặt hàng thật — có mã dùng chung, có thể trôi dạt tồn kho, có
BOM riêng độc lập với vị trí sử dụng. Trong khi nhu cầu thật chỉ là: một cấu trúc con thuộc về đúng
1 sản phẩm, đặt tên trực tiếp tại vị trí đó, không cần định danh hay tái sử dụng.

## Đừng làm ngược lại

- **Đừng hồi sinh `items.type = WIP`** hay bất kỳ hình thức "node COMPONENT có BOM riêng ở nơi khác" —
  khái niệm này đã bị xoá có chủ đích, không có gì thay thế.
- **Đừng thêm lại `checkNoCycle`/`MAX_BOM_DEPTH`** trừ khi node COMPONENT lại được cấp định danh dùng
  chung (nếu vậy, đó là một đảo chiều khác, cần quyết định riêng).
- **Đừng unique hoá `bom_items.code`/`name`** của node COMPONENT — trùng mã/tên giữa 2 BOM khác nhau
  (thậm chí trong cùng 1 cây) là hợp lệ, vì đây là dữ liệu tự do riêng của từng vị trí.

## Phạm vi KHÔNG đổi trong đợt này

`UnitScope.SEMI_FINISHED` (dead code từ trước, không module nào validate theo nó) — không đụng,
độc lập hoàn toàn với đợt này. Tên hằng `DocumentType.ITEM_FG_WIP` — giữ nguyên (tên lịch sử, đổi
không có lợi gì, chỉ tổ phải data-migrate `document_sequences`).

## Liên quan

- `docs/domains/product-structure.md` — mô hình `items`/BOM đầy đủ sau khi bỏ WIP.
- `docs/decisions/items-merge.md` — quyết định gộp `products`+`materials` trước đó (lịch sử, còn
  nhắc 3 giá trị FG/WIP/CONSUMABLE ở phần snapshot Job).
- `docs/decisions/wip-not-stocked.md` — quyết định cũ về việc kho không quản tồn WIP; nay bất biến
  thay thế là node COMPONENT không có `items.id` nên không thể vào `inventory_balances`.
- `docs/workflows/product-setup.md`, `docs/workflows/outsourcing-round-trip.md`,
  `docs/workflows/supplier-return.md`, `docs/domains/quality-iqc.md`, `docs/domains/production.md`.
