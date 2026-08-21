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

**`items` không có bảng tài liệu đính kèm.** Chỉ mang một file duy nhất — `imageFileId`, ảnh đại
diện. Tài liệu kỹ thuật (bản vẽ) gắn theo **từng node BOM** (`bom_items.drawingFileId`), không gắn
theo item — đúng ngữ nghĩa nghiệp vụ: một WIP dùng lại ở hai vị trí trong hai cây khác nhau hoàn
toàn có thể mang hai bản vẽ khác nhau. Mỗi node tối đa một file (không phải danh sách). RM trước
đây có bảng đính kèm riêng (`material_attachments`) — đã xoá khi gộp, 0 dòng dữ liệu thật.

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

**Versioning = clone cả item, không phải lịch sử phiên bản.** Từng có `product_revisions`, đã bị
xoá. Lý do: một biến thể là một item mới hẳn, nên sửa BOM/routing về sau không bao giờ làm thay đổi
ngược dữ liệu đã nằm trong đơn hàng cũ. `clonedFromItemId` chỉ ghi lại nguồn gốc để hiển thị,
**không tạo ràng buộc gì**. Clone chỉ áp dụng cho FG/WIP — RM không có cây để nhân bản (`E110`).

## Entities

| Entity | Vai trò |
| --- | --- |
| `items` | FG, WIP, hoặc RM; `clonedFromItemId` (nullable, tự trỏ) ghi lineage khi clone |
| `boms` | Header, **đúng một dòng cho mỗi item** (unique `itemId`); chỉ FG/WIP có (`E111` nếu RM) |
| `bom_items` | Node của cây cấu trúc, tự lồng qua `parentId`; `itemId` NOT NULL, có thể trỏ WIP (node) hoặc RM (lá); `drawingFileId` (nullable) là bản vẽ kỹ thuật riêng của node |
| `bom_operations` | Công đoạn as-used; `bomItemId` NOT NULL — chỉ gắn được vào node WIP |
| `routings` | Header routing Cấp 0 của chính item gốc — đúng một dòng cho mỗi item (unique `itemId`); chỉ FG/WIP có (`E111` nếu RM) |
| `routing_operations` | Bước routing Cấp 0; `routingId` NOT NULL |
| `operations` | Danh mục công đoạn gốc (`INHOUSE`/`OUTSOURCE`), chỉ đọc — xem `docs/domains/partners.md` |

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
chỉ nhận `WIP`/`RM` (CHECK).

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
  `production_job_bom_items`/`production_job_operations` (id mới, độc lập). Vật tư của Job
  (`production_job_issues`) là bản gộp riêng: `SUM(quantity) GROUP BY itemId` trên mọi lá RM
  thuộc cây, nhân với SL Job — xem `docs/domains/production.md`. Routing Cấp 0 của FG/WIP
  (`routings`/`routing_operations`) **không** được đọc/snapshot ở bước này. Ngoài thời điểm đó,
  không module sản xuất nào tham chiếu `boms`/`bom_items`/`bom_operations`/`routings`/
  `routing_operations` nữa; Job không chia nhỏ tiến độ theo công đoạn.
- Phép gộp vật tư (`SUM(quantity) GROUP BY itemId` trên mọi lá RM thuộc cây một item) — **không
  nhân qua số lượng của các node cha**, nên nó *không* phải BOM explosion.
  `production_job_issues.unitQty`/`requiredQty` thừa hưởng nguyên giới hạn này —
  `GET /production-jobs/:jobId/bom` trả thẳng `requiredQty`, không tính lại.
- **Inventory** `GET /inventory` chỉ thấy item ACTIVE, mọi `type` (FG/WIP/RM) khi bỏ trống filter
  `itemType` — một route chung, không còn tách theo loại như trước.
- **Orders** tham chiếu `items.id` trên từng dòng (chỉ FG hợp lệ, service-enforced không phải DB
  CHECK), và cố ý **không snapshot** tên/ảnh — luôn đọc qua quan hệ.

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
6. **Tưởng ảnh (`items.imageFileId`) và bản vẽ (`bom_items.drawingFileId`) là một.** Khác nhau: ảnh
   là ảnh đại diện của item, đọc ké vào mọi node BOM trỏ tới item đó; bản vẽ là tài liệu kỹ thuật
   riêng của **từng node**, không đọc qua `itemId`.
7. **Tưởng clone là đệ quy.** Clone giữ nguyên `itemId` của node — nó **không** clone các WIP/RM
   được tham chiếu, chỉ clone cấu trúc cây của chính cây đó.
8. **Đi tìm bảng `bom_materials` riêng.** Không còn — vật tư (RM) là lá ngay trong `bom_items`, xem
   `docs/decisions/items-merge.md`.
9. **Tưởng một WIP không có node `bom_items` con nào có thể tự làm lá của chính nó.** Một item
   không được tự làm con của chính nó (`E054`), nên không có cách "tự gắn" một node vào chính BOM
   của mình ngoài luồng thêm node bình thường.

## Related docs

- `docs/workflows/product-setup.md` — thứ tự dựng item → BOM → công đoạn → nhân bản.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
- `docs/decisions/items-merge.md` — vì sao `products`/`materials` gộp thành `items`.
