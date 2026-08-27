# Product Structure (Items — BOM — Công đoạn)

## Purpose

Mô tả **một item được làm từ gì và đi qua những bước nào**: danh mục hàng hoá (`items`), cây cấu
trúc (BOM) và chuỗi công đoạn (routing). Đây là dữ liệu nền cho sản xuất — nhưng xem mục
"Cross-domain" trước khi giả định nó đã được dùng để tính nhu cầu vật tư.

## Core concepts

**Một bảng `items` chứa cả thành phẩm, bán thành phẩm lẫn vật tư.** `type` là `FG` (thành phẩm),
`WIP` (bán thành phẩm), hoặc `RM` (vật tư/nguyên liệu) — gộp từ hai bảng `products`/`materials` cũ,
xem `docs/decisions/items-merge.md`. Cột riêng của RM (`supplierId`, `minStock`, `materialGrade`,
`technicalStandard`, `dimensions`, `specificWeight`, `colorSurface`, `description`, `origin`,
`leadTime`) nằm ngay trên `items`, luôn NULL/mặc định với FG/WIP.

**RM luôn là lá trong cây BOM — không có BOM/routing của chính nó.** FG/WIP thì ngược lại: một node
trỏ WIP **có thể có BOM riêng của nó**, và cả FG lẫn WIP đều có thể có routing Cấp 0
(`routings`/`routing_operations`). Khác biệt hành vi giữa ba `type`: chỉ RM bị chặn khỏi
`POST /items/:itemId/bom/items` (khi được đặt làm cha, `E052`) và khỏi
`POST /items/:itemId/operations` (`E111`); màn tồn kho là một route chung (`GET /inventory`, lọc
tuỳ chọn qua `itemType`); dòng phiếu nhập/xuất thành phẩm chỉ nhận FG (kiểm ở
`InventoryIssuesService.ensureItemsValid` khi có `orderItemId`). Mọi thứ còn lại (ảnh, mã tự sinh,
clone) cả ba loại như nhau.

**`items` mang hai loại file khác nhau, đừng nhầm lẫn.** Ảnh đại diện — `imageFileId`, tối đa một
file, đọc ké vào mọi node BOM trỏ tới item đó. Tài liệu đính kèm cấp item — bảng nối `item_files`
(cùng khuôn `supplier_files`/`order_files`), một item mang được **nhiều** tài liệu (hồ sơ kỹ thuật,
tiêu chuẩn, catalogue...), ghi/đọc qua `fileIds` ở `POST`/`PATCH /items` (replace-all mỗi lần sửa,
cùng khuôn `clients` contacts). **Khác** với bản vẽ kỹ thuật theo **từng node BOM**
(`bom_items.drawingFileId`) — bản vẽ gắn theo *vị trí trong cây*, không gắn theo item: một WIP dùng
lại ở hai vị trí trong hai cây khác nhau hoàn toàn có thể mang hai bản vẽ khác nhau, và mỗi node tối
đa một file (không phải danh sách). Hai khái niệm không thay thế được nhau — `item_files` là hồ sơ
chung của mã hàng, bản vẽ node là tài liệu riêng của một lần dùng lại trong cấu trúc.

**Không có nhóm hàng hoá.** `product_groups`/`material_groups` đã xoá khi gộp — `type` là thứ duy
nhất phân loại `items`.

**BOM là một cây phẳng, không đệ quy xuống BOM con.** Mỗi item (FG hoặc WIP) có tối đa một `boms`
(header), chứa các node `bom_items` lồng nhau qua `parentId`. Node gốc "Cấp 0" **không phải một
dòng** — `parentId = null` nghĩa là con trực tiếp của item gốc. Mỗi node `bom_items` trỏ một
`itemId` — **có thể là WIP (node có thể có con) hoặc RM (lá, không có con)**, phân biệt qua
`items.type` của item được trỏ tới, không phải một cột riêng trên `bom_items`.

Điểm dễ hiểu sai nhất: một node `bom_items` trỏ tới một WIP **có thể có BOM riêng của nó**, nhưng
khi đọc cây, hệ thống **không bao giờ đi xuống BOM đó**. "Nhiều cấp" ở đây nghĩa là người dùng tự
dựng sâu trong *một* cây, không phải hệ thống tự bung BOM con.

**Routing "as-used" thuộc về vị trí trong cấu trúc, không thuộc về item.** `routings`/
`routing_operations` là routing Cấp 0 — của chính item gốc (FG hoặc WIP), khoá theo `itemId`.
Routing as-used của một node cây sống ở bảng riêng `bom_operations` (`bomItemId` NOT NULL) — chỉ
gắn được vào node WIP, không gắn được vào lá RM (`E063`). Lý do nghiệp vụ của việc as-used theo vị
trí: cùng một chi tiết, lắp ở vị trí này thì hàn + cần 2 con ốc, ở vị trí khác thì sơn + không cần
ốc thêm.

**Vật tư của một WIP con không tự động cộng vào cây cha.** Đọc cây cha không đệ quy xuống BOM riêng
của WIP con (đoạn trên) — lá RM gắn ở một node trong cây cha là **khai riêng, không tự suy ra** từ
lá RM trên cây BOM riêng của WIP mà node đó tham chiếu (nếu WIP đó có cây riêng).

**SL của một node phải nguyên nếu node là WIP, được phép lẻ nếu là RM.** WIP là cấu trúc lắp ráp
(SL nguyên: 4 chân bàn, không phải 4.5); RM là định mức vật tư (SL lẻ: 0.3kg sơn). Validate ở
`BomsService.ensureQuantityValid`, theo `type` của item đang thêm — không còn chặn tĩnh ở DTO vì
một cột `quantity` giờ phục vụ cả hai loại node (`E055`).

**Đơn vị tính (ĐVT) là danh mục dùng chung, không thuộc riêng `items`.** `units` (1) — `unit_scopes`
(n) nói ĐVT đó gán được cho loại entity nào: `UnitScope.MATERIAL` cho RM, `UnitScope.PRODUCT` cho
FG/WIP (`ItemsService.ensureUnitExists` map đúng theo `items.type`, `E043` nếu sai scope). Bất
biến: **một unit không còn scope nào là unit chết** — CRUD `units` luôn ghi/xoá cả hai bảng trong
một transaction (`UnitsService.createUnit`/`updateUnit`), không có scope rời. `UnitScope` còn giá
trị thứ ba `SEMI_FINISHED`, nhưng **chưa module nào đọc nó** — coi là dự trữ, không phải bug thiếu
implement. Xoá một `unit`, hoặc gỡ một scope khỏi nó, đều bị chặn khi còn `items`/
`production_job_units` tham chiếu (FK `restrict`); service kiểm trước để trả 409 sạch thay vì lỗi
FK thô.

**Versioning = clone cả item, không phải lịch sử phiên bản.** Từng có `product_revisions`, đã bị
xoá. Lý do: một biến thể là một item mới hẳn, nên sửa BOM/routing về sau không bao giờ làm thay đổi
ngược dữ liệu đã nằm trong đơn hàng cũ. `clonedFromItemId` chỉ ghi lại nguồn gốc để hiển thị,
**không tạo ràng buộc gì**. Clone chỉ áp dụng cho FG/WIP — RM không có cây để nhân bản (`E110`).

## Entities

| Entity | Vai trò |
| --- | --- |
| `items` | FG, WIP, hoặc RM; `clonedFromItemId` (nullable, tự trỏ) ghi lineage khi clone |
| `item_files` | Nối `items` ↔ `files` — tài liệu đính kèm cấp item, nhiều dòng/item, replace-all qua `fileIds` |
| `boms` | Header, **đúng một dòng cho mỗi item** (unique `itemId`); chỉ FG/WIP có (`E111` nếu RM) |
| `bom_items` | Node của cây cấu trúc, tự lồng qua `parentId`; `itemId` NOT NULL, có thể trỏ WIP (node) hoặc RM (lá); `drawingFileId` (nullable) là bản vẽ kỹ thuật riêng của node |
| `bom_operations` | Công đoạn as-used; `bomItemId` NOT NULL — chỉ gắn được vào node WIP |
| `routings` | Header routing Cấp 0 của chính item gốc — đúng một dòng cho mỗi item (unique `itemId`); chỉ FG/WIP có (`E111` nếu RM) |
| `routing_operations` | Bước routing Cấp 0; `routingId` NOT NULL |
| `operations` | Danh mục công đoạn gốc (`INHOUSE`/`OUTSOURCE`), chỉ đọc — xem `docs/domains/partners.md` |
| `units` | Đơn vị tính (ĐVT), `code`+`name`; CRUD đầy đủ qua `/units` |
| `unit_scopes` | Composite PK `(unitId, scope)` — loại entity mà một ĐVT dùng được; ghi/xoá theo cặp với `units` |

## Lifecycle

`ItemStatus` = `ACTIVE | INACTIVE`, mặc định `ACTIVE`. **Trạng thái này gần như không gác gì** — chỉ
màn tồn kho lọc theo nó. Node BOM, dòng đơn hàng và sản xuất đều nhận item `INACTIVE`. Coi nó là cờ
hiển thị/lọc, không phải cổng nghiệp vụ.

**BOM/routing sinh ra lười, không sinh cùng item.** `POST /items` không tạo `boms` lẫn `routings`.
Cả hai header chỉ được tạo trong transaction ghi dòng đầu tiên (get-or-create, cùng khuôn
`BomsService.getOrCreateBomId`/`RoutingsService.getOrCreateRoutingId`). Đọc cây/routing của
item chưa có dòng nào trả mảng rỗng — bình thường, không phải lỗi.

**Không có route xoá item** — cùng khuôn `users`/`roles`/`operations` (`.claude/rules/database.md`,
Soft delete): `deletedAt` vẫn là cột lọc read, chỉ không còn đường ghi nào set nó qua API.

## Business rules

- Một node `bom_items` không được trỏ tới FG (`E053`).
- Node WIP phải có `quantity` nguyên dương; node RM chỉ cần dương, được phép lẻ (`E055`).
- Node cha phải cùng một BOM với node con; cha là RM thì không được nhận con (`E052`).
- `bomItemId` trong route routing phải thuộc đúng item trên URL — không với sang cây khác được.
  `BomOperationsService` ném `E051` qua `BomsService.ensureBomItemInBom` (public trên `BomsService`).
- Gắn `bom_operations` vào một node RM bị chặn (`E063`) — RM là lá, không có công đoạn as-used.
- `operationId` trên một dòng `bom_operations`/`routing_operations` **bất biến** sau khi thêm: đổi
  công đoạn = xoá bước rồi thêm lại.
- Một chuỗi routing **được phép lặp lại cùng một công đoạn** (hàn → sơn → hàn) — không có ràng buộc
  unique. Một node cũng **được phép khai trùng vật tư** trên hai dòng khác nhau (khác ghi chú) —
  cùng tinh thần (không unique trên `(bomId, parentId, itemId)`).
- Đơn vị tính của item phải đúng scope theo `type`: `PRODUCT` cho FG/WIP, `MATERIAL` cho RM (`E043`).
- `POST /items/:itemId/copy` chặn khi item là RM (`E110`) — RM không có cây BOM để nhân bản.

## Invariants

**DB đảm bảo** (không thể lách kể cả bằng SQL tay): một BOM và một routing cho mỗi item;
`bom_items.itemId` NOT NULL; `quantity > 0` trên `bom_items`; `production_job_bom_items.itemType`
chỉ nhận `FG`/`WIP`/`RM` (CHECK, cùng miền giá trị `ItemType`) — **kể cả `FG`**, vì mỗi Job có đúng
một node Cấp 0 `itemType = 'FG'` snapshot cả bước lắp ráp cuối (`docs/decisions/oqc-per-operation.md`,
mục "QC cho Cấp 0"), không riêng WIP/RM như cây BOM sống.

**Chỉ service đảm bảo** (SQL tay lách được): node được thêm không phải FG; node RM không nhận con;
node RM không gắn được `bom_operations`; SL nguyên nếu node là WIP; cha cùng BOM; không có chu
trình; độ sâu ≤ 50; item gốc của BOM/routing không phải RM.

**Không ai đảm bảo** — đừng giả định:

- **Chu trình xuyên cây.** Kiểm chu trình chỉ chạy trong phạm vi *một* cây. BOM của A chứa B, và BOM
  riêng của B chứa A — hoàn toàn lọt.
- **Node anh em trùng nhau.** Không có unique trên `(bomId, parentId, itemId)`; thêm hai node y hệt
  cạnh nhau là hợp lệ, kể cả hai lá RM cùng `itemId` trên cùng một node cha.

## Cross-domain dependencies

- **Production** đọc **một nguồn duy nhất**, đúng **một lần**, lúc duyệt LSX: toàn bộ cây `bom_items`
  (cả node WIP lẫn lá RM) + `bom_operations` as-used của từng node WIP, nhân bản sang
  `production_job_bom_items`/`production_job_operations` (id mới, độc lập, `quantity` giữ nguyên
  thô — chỉ so với cha trực tiếp). Vật tư của Job (`production_job_issues`) là bản **đã nổ cấp**:
  nhân luỹ kế `quantity` qua toàn bộ chuỗi node cha (seed = SL Job tại gốc), rồi gộp
  `SUM(...) GROUP BY itemId` trên mọi lá RM thuộc cây — xem "Chuẩn nổ cấp BOM" bên dưới và
  `docs/domains/production.md`. Routing Cấp 0 của FG/WIP (`routings`/`routing_operations`)
  **không** được đọc/snapshot ở bước này. Ngoài thời điểm đó, không module sản xuất nào tham chiếu
  `boms`/`bom_items`/`bom_operations`/`routings`/`routing_operations` nữa; Job không chia nhỏ tiến
  độ theo công đoạn.
- **Inventory** `GET /inventory` chỉ thấy item ACTIVE, mọi `type` (FG/WIP/RM) khi bỏ trống filter
  `itemType` — một route chung, không còn tách theo loại như trước.
- **Orders** tham chiếu `items.id` trên từng dòng (chỉ FG hợp lệ, service-enforced không phải DB
  CHECK), và cố ý **không snapshot** tên/ảnh — luôn đọc qua quan hệ.

## Chuẩn nổ cấp BOM: SL thô (per-parent) vs SL nổ cấp (exploded)

`bom_items.quantity` (và song sinh `production_job_bom_items.quantity`) **luôn luôn** nghĩa là "SL
cần cho 1 đơn vị của node **cha trực tiếp**" — bất biến, dữ liệu gốc dùng để CRUD/edit. `GET
/items/:itemId/bom` (tab "Cấu trúc & Công đoạn") hiển thị thẳng giá trị này, đúng nguyên trạng —
UI đã có đủ ngữ cảnh (`level`, thụt lề) để người xem tự hiểu "so với cha nào".

Ngược lại, bất kỳ field nào có nhãn ngụ ý **tổng cho 1 đơn vị gốc** ("Định mức / 1 bộ", "Nhu cầu vật
tư", "SL BOM") **PHẢI** là giá trị đã **nổ cấp**: nhân luỹ kế `quantity` qua toàn bộ chuỗi node cha,
seed = 1 tại gốc (hoặc = SL Job nếu ngữ cảnh là Job) — dừng đúng ở tầng RM, vì RM luôn là lá
(`ensureBomItemCanHaveChildren`, `E052`), không có cấp con nào bên dưới. Khi ngữ cảnh cần một con số
duy nhất cho một vật tư (báo cáo tổng nhu cầu), còn phải gộp `SUM(...) GROUP BY itemId` sau khi nổ
cấp — cùng một vật tư có thể xuất hiện ở nhiều nhánh khác nhau trong cây. Hai nơi áp dụng chuẩn này:
`production_job_issues.requiredQty` (seed = SL Job, xem `docs/domains/production.md`) và `GET
/items/:itemId/issues` (seed = 1, dưới đây).

Trước 2026-08-26, cả hai route trên từng cố ý **không** nổ cấp (`SUM(quantity) GROUP BY itemId` trên
giá trị thô) — xem `docs/decisions/bom-explosion-in-job-demand.md` vì sao đảo chiều, và đừng hoàn lại.

**`GET /items/:itemId/issues`** (`ItemIssueResDto`, tab "Thành phần vật tư") là báo cáo phái sinh
chỉ-đọc, tách biệt hoàn toàn với cây `GET /items/:itemId/bom` — 1 dòng/1 vật tư (gộp theo `itemId`,
không còn 1-1 với một dòng `bom_items`), `requiredQty` trả về là số đã nổ cấp cho 1 đơn vị chính
item gốc — cùng tên field với `ProductionJobIssueResDto.requiredQty` phía Job, cố ý đồng bộ vì cùng
khái niệm (khác seed). Vì gộp, dòng này không còn `sortOrder`/`note` (gắn với một vị trí cụ thể
trong cây) — sắp theo `code`.

## Common mistakes

1. **Tưởng đọc BOM sẽ đệ quy xuống BOM của WIP con.** Không. Mỗi cây độc lập — và lá RM trên cây
   riêng của một WIP con (nếu có) cũng **không** tự cộng vào cây cha đang tham chiếu nó.
2. **Tưởng `boms`/`routings` đã tồn tại sau khi tạo item.** Chưa. Luôn xử lý trường hợp chưa có,
   và dùng đúng pattern get-or-create thay vì insert trần.
3. **Coi routing là thuộc tính của item.** As-used sống trên `bom_items.id` (`bom_operations`);
   routing còn khai được ở Cấp 0 (`routings.itemId`, gốc cây) — sửa một vị trí không được đụng vị
   trí song sinh của nó.
4. **Xoá một node giữa cây** sẽ cascade sạch cả nhánh con (kể cả lá RM) và routing as-used
   (`bom_operations`) của chúng, không cảnh báo trước, không đếm trước.
5. **Thêm ràng buộc "một node cho mỗi (cha, item)" hoặc chống chu trình xuyên cây vì tưởng đã có.**
   Cả hai đều chưa có.
6. **Tưởng ảnh (`items.imageFileId`), tài liệu đính kèm (`item_files`) và bản vẽ
   (`bom_items.drawingFileId`) là cùng một thứ.** Ba khái niệm khác nhau: ảnh là ảnh đại diện, tối
   đa một file, đọc ké vào mọi node BOM trỏ tới item đó; `item_files` là hồ sơ tài liệu chung của mã
   hàng (nhiều file, không phân biệt node); bản vẽ là tài liệu kỹ thuật riêng của **từng node**,
   không đọc qua `itemId`.
7. **Bỏ `item_files` vì tưởng bản vẽ node BOM đã thay thế được.** Đã từng bị bỏ nhầm khi gộp
   `products`+`materials` thành `items` (04/08/2026, `docs/decisions/items-merge.md`) — tưởng
   `bom_items.drawingFileId` phủ luôn nhu cầu tài liệu cấp item. Sai: bản vẽ node là tài liệu riêng
   của *một vị trí trong cấu trúc*, không phải hồ sơ chung của mã hàng — tài liệu đã chốt với khách
   (Excel dòng 17, chức năng [4.2]) đòi cả hai, không thứ nào thay được thứ kia. Khôi phục lại
   27/08/2026 (BUG-007). Đừng lặp lại nhầm lẫn này.
8. **Tưởng clone là đệ quy.** Clone giữ nguyên `itemId` của node — nó **không** clone các WIP/RM
   được tham chiếu, chỉ clone cấu trúc cây của chính cây đó. Clone **có** mang theo `item_files`
   (cùng `drawingFileId` trên `bom_items`) — không rơi mất tài liệu như từng xảy ra với bản vẽ trước
   khi được sửa.
9. **Đi tìm bảng `bom_materials` riêng.** Không còn — vật tư (RM) là lá ngay trong `bom_items`, xem
   `docs/decisions/items-merge.md`.
10. **Tưởng một WIP không có node `bom_items` con nào có thể tự làm lá của chính nó.** Một item
    không được tự làm con của chính nó (`E054`), nên không có cách "tự gắn" một node vào chính BOM
    của mình ngoài luồng thêm node bình thường.

## Related docs

- `docs/workflows/product-setup.md` — thứ tự dựng item → BOM → công đoạn → nhân bản.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
- `docs/decisions/items-merge.md` — vì sao `products`/`materials` gộp thành `items`.
