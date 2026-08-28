# Product Structure (Items — BOM — Công đoạn)

## Purpose

Mô tả một item được làm từ gì và đi qua những bước nào: danh mục hàng hoá (`items`), cây cấu trúc
(BOM) và chuỗi công đoạn (routing) — dữ liệu nền cho sản xuất, xem "Cross-domain" trước khi giả định
nó đã dùng để tính nhu cầu vật tư.

## Core concepts

**Một bảng `items` chứa cả FG/WIP/RM** (`docs/decisions/items-merge.md`). Cột riêng của RM
(`supplierId`, `minStock`, `materialGrade`, `technicalStandard`, ...) luôn NULL/mặc định với FG/WIP.

**RM luôn là lá — không có BOM/routing riêng.** Chỉ RM bị chặn khỏi làm cha
(`POST /items/:itemId/bom/items`, `E052`) và khỏi khai routing Cấp 0 (`E111`). Dòng phiếu nhập/xuất
liên kết `orderItemId` chỉ nhận FG (service-enforced).

**`items` mang 3 loại file khác nhau:** ảnh đại diện (`imageFileId`, tối đa 1, đọc ké vào mọi node
BOM trỏ tới item) — tài liệu đính kèm cấp item (`item_files`, nhiều file/item, replace-all qua
`fileIds`) — bản vẽ kỹ thuật **theo từng node BOM** (`bom_items.drawingFileId`, gắn theo vị trí
trong cây, không theo item: cùng WIP dùng lại ở 2 vị trí có thể mang 2 bản vẽ khác nhau). Ba khái
niệm không thay thế nhau.

**BOM là cây phẳng, không đệ quy xuống BOM con.** Mỗi item (FG/WIP) tối đa 1 `boms` header, node
`bom_items` lồng qua `parentId`. Một node trỏ WIP **có thể có BOM riêng**, nhưng đọc cây **không bao
giờ** đi xuống BOM đó — "nhiều cấp" là người dùng tự dựng sâu trong một cây, không tự bung BOM con.

**Routing "as-used" thuộc vị trí trong cấu trúc, không thuộc item.** `routings`/`routing_operations`
là routing Cấp 0 của chính item gốc. As-used của một node sống ở `bom_operations` (`bomItemId` NOT
NULL, chỉ gắn node WIP, `E063` nếu RM) — cùng một part lắp ở vị trí này thì hàn+2 ốc, vị trí khác
thì sơn, không cần ốc.

**SL node phải nguyên nếu là WIP, được phép lẻ nếu là RM** (`ensureQuantityValid`, `E055`).

**ĐVT dùng chung, không thuộc riêng `items`.** `units` — `unit_scopes` map scope theo `type`
(`MATERIAL`↔RM, `PRODUCT`↔FG/WIP, `E043` sai scope). Một unit không còn scope nào là unit chết — CRUD
`units` ghi/xoá cả 2 bảng trong 1 transaction. `SEMI_FINISHED` là scope thứ 3, chưa module nào đọc.

**Versioning = clone cả item** (`clonedFromItemId` chỉ ghi lineage, không ràng buộc) — không phải
lịch sử phiên bản, vì sửa BOM/routing sau này không được đổi ngược dữ liệu đã nằm trong đơn cũ.
Clone chỉ FG/WIP (`E110` nếu RM).

## Entities

| Entity | Vai trò |
| --- | --- |
| `items` | FG/WIP/RM; `clonedFromItemId` ghi lineage; full CRUD kể cả `DELETE` (soft, `E255` nếu đang dùng) |
| `item_files` | Nối `items`↔`files`, nhiều dòng/item, replace-all qua `fileIds` |
| `boms` | Header, 1 dòng/item (unique `itemId`), chỉ FG/WIP |
| `bom_items` | Node cây, tự lồng `parentId`; `drawingFileId` là bản vẽ riêng của node |
| `bom_operations` | Công đoạn as-used, `bomItemId` NOT NULL, chỉ gắn node WIP |
| `routings` / `routing_operations` | Routing Cấp 0 của item gốc, 1 dòng/item |
| `operations` | Danh mục công đoạn gốc, full CRUD — `docs/domains/partners.md` |
| `units` / `unit_scopes` | ĐVT + scope dùng được, ghi/xoá theo cặp |

## Lifecycle

`ItemStatus = ACTIVE | INACTIVE` — gần như không gác gì, chỉ màn tồn kho lọc theo. Node BOM/dòng đơn
hàng/sản xuất đều nhận item `INACTIVE`.

`boms`/`routings` sinh lười (get-or-create trong transaction ghi dòng đầu tiên) — `POST /items`
không tạo. Đọc cây/routing của item chưa có dòng trả mảng rỗng, không phải lỗi.

`DELETE /items/:itemId` (soft, `items:delete`) — chặn `E255` nếu item còn được BOM/đơn hàng/LSX
tham chiếu.

## Business rules

- Node không được trỏ FG (`E053`). Node WIP `quantity` nguyên dương; RM dương, được phép lẻ (`E055`).
- Node cha phải cùng BOM với con; cha là RM thì không nhận con (`E052`).
- `bomItemId` trong route routing phải thuộc đúng item trên URL (`E051`). Gắn `bom_operations` vào
  node RM bị chặn (`E063`).
- `operationId` trên một dòng `bom_operations`/`routing_operations` bất biến — đổi công đoạn = xoá
  bước rồi thêm lại.
- Một chuỗi routing được lặp lại cùng công đoạn (không unique). Hai node anh em **cùng `itemId`**
  trên cùng node cha **bị chặn** — `uq_bom_items_bom_item_no_parent` (gốc)/
  `uq_bom_items_bom_parent_item` (có cha) ở DB, cộng `ensureBomItemNotDuplicate` → `E245` ở service.
- ĐVT của item phải đúng scope theo `type` (`E043`). `POST /items/:itemId/copy` chặn RM (`E110`).

## Invariants

**DB đảm bảo:** 1 BOM + 1 routing/item; `bom_items.itemId` NOT NULL; `quantity > 0`; không có 2
node anh em cùng `itemId` (`uq_bom_items_bom_item_no_parent`/`uq_bom_items_bom_parent_item`);
`production_job_bom_items.itemType` nhận cả `FG`/`WIP`/`RM` (CHECK) — kể cả `FG`, vì mỗi Job có 1
node Cấp 0 `itemType='FG'` (`docs/decisions/oqc-per-operation.md`), khác cây BOM sống chỉ có WIP/RM.

**Chỉ service đảm bảo:** node thêm không phải FG; node RM không nhận con/không gắn `bom_operations`;
SL nguyên nếu WIP; cha cùng BOM; không chu trình; độ sâu ≤ 50; item gốc BOM/routing không phải RM;
node anh em trùng `itemId` (`E245`, cùng DB constraint ở trên — 2 lớp).

**Không ai đảm bảo:** chu trình **xuyên cây** — BOM của A chứa B, BOM riêng của B chứa A thì lọt,
kiểm chu trình chỉ chạy trong phạm vi một cây.

## Cross-domain dependencies

- **→ Production**: đọc đúng 1 lần lúc duyệt LSX — toàn bộ cây `bom_items` + `bom_operations`
  as-used, nhân bản sang `production_job_bom_items`/`production_job_operations` (id mới, `quantity`
  giữ nguyên thô). Vật tư Job (`production_job_issues`) là bản **đã nổ cấp** — xem "Chuẩn nổ cấp
  BOM". Routing Cấp 0 của FG/WIP **không** đọc/snapshot ở bước này. Ngoài thời điểm đó, Production
  không tham chiếu lại `boms`/`bom_items`/`routings` nữa.
- **← Inventory**: `GET /inventory-products`/`GET /inventory-materials` chỉ thấy item `ACTIVE`.
- **← Orders**: dòng đơn tham chiếu `items.id` — **không có kiểm tra nào** ép phải là FG (không
  service-enforced, không DB CHECK; khác `inventory-issues.ensureItemsValid` có kiểm thật cho
  `orderItemId` trên dòng phiếu xuất). Cố ý không snapshot tên/ảnh, luôn đọc qua quan hệ.

## Chuẩn nổ cấp BOM: SL thô (per-parent) vs SL nổ cấp (exploded)

`bom_items.quantity` luôn là "SL cần cho 1 đơn vị của node **cha trực tiếp**" — dữ liệu gốc.
`GET /items/:itemId/bom` hiển thị thẳng giá trị này (UI đã có `level`/thụt lề để tự hiểu).

Field nào ngụ ý **tổng cho 1 đơn vị gốc** ("Định mức/1 bộ", "Nhu cầu vật tư") PHẢI là giá trị đã
**nổ cấp**: nhân luỹ kế `quantity` qua chuỗi node cha, seed=1 tại gốc (hoặc = SL Job), dừng ở RM (lá).
Cần một số duy nhất/vật tư thì gộp `SUM(...) GROUP BY itemId` sau khi nổ cấp. Hai nơi áp dụng:
`production_job_issues.requiredQty` (seed=SL Job) và `GET /items/:itemId/issues` (seed=1) —
`docs/decisions/bom-explosion-in-job-demand.md` giải thích vì sao đảo từ "không nổ cấp" sang nổ cấp.

`GET /items/:itemId/issues` (tab "Thành phần vật tư") là báo cáo phái sinh chỉ-đọc, 1 dòng/vật tư
(gộp), tách biệt cây `GET /items/:itemId/bom` — không có `sortOrder`/`note` (gắn 1 vị trí cụ thể).

## Common mistakes

1. Đọc BOM không đệ quy xuống BOM của WIP con — lá RM trên cây riêng của WIP con không tự cộng vào
   cây cha tham chiếu nó.
2. `boms`/`routings` chưa chắc tồn tại sau khi tạo item — luôn xử lý get-or-create.
3. Routing không phải thuộc tính của item — as-used sống trên `bom_items.id`, Cấp 0 khai ở
   `routings.itemId`, hai vị trí độc lập.
4. Xoá một node giữa cây cascade sạch cả nhánh con + routing as-used, không cảnh báo trước.
5. Node anh em trùng `itemId` **bị chặn** (`E245` + 2 unique index) — đã có từ đầu, không phải
   thiếu sót; chu trình xuyên cây thì thật sự chưa có.
6. Ảnh (`imageFileId`), tài liệu (`item_files`), bản vẽ (`bom_items.drawingFileId`) là 3 khái niệm
   khác nhau, không thay thế nhau.
7. Clone không đệ quy — giữ nguyên `itemId` của node tham chiếu, chỉ clone cấu trúc cây của chính
   cây đó (kèm `item_files`/`drawingFileId`).
8. Không có bảng `bom_materials` riêng — RM là lá ngay trong `bom_items`.
9. Một item không tự làm con của chính nó (`E054`).

## Related docs

- `docs/workflows/product-setup.md` — thứ tự dựng item → BOM → công đoạn → nhân bản.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
- `docs/decisions/items-merge.md`, `docs/decisions/bom-explosion-in-job-demand.md`.
