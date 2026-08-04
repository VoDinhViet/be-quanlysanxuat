# Product Structure (Sản phẩm — BOM — Công đoạn)

## Purpose

Mô tả **một sản phẩm được làm từ gì và đi qua những bước nào**: cây cấu trúc (BOM) và chuỗi công đoạn (routing). Đây là dữ liệu nền cho sản xuất — nhưng xem mục "Cross-domain" trước khi giả định nó đã được dùng để tính nhu cầu vật tư.

## Core concepts

**Một bảng `products` chứa cả thành phẩm lẫn bán thành phẩm.** `type` là `FINISHED_GOOD` (FG) hoặc `WORK_IN_PROGRESS` (WIP). Khác biệt hành vi rất hẹp — chỉ ba chỗ: một node PRODUCT trong BOM bắt buộc phải là WIP (FG không bao giờ làm con ai), màn tồn kho chỉ liệt kê FG, và dòng phiếu nhập/xuất thành phẩm chỉ nhận FG. Mọi thứ còn lại (ảnh, BOM riêng, routing riêng, clone) hai loại như nhau — **một WIP hoàn toàn có BOM và routing của chính nó**.

**Sản phẩm không có bảng tài liệu đính kèm.** `products` chỉ mang một file duy nhất —
`imageFileId`, ảnh đại diện. Tài liệu kỹ thuật (bản vẽ) gắn theo **từng node BOM**
(`bom_items.drawingFileId`), không gắn theo sản phẩm — đúng ngữ nghĩa nghiệp vụ: một WIP dùng lại ở
hai vị trí trong hai cây khác nhau hoàn toàn có thể mang hai bản vẽ khác nhau. Mỗi node tối đa một
file (không phải danh sách). Bảng `product_attachments` (panel "đính kèm" mức sản phẩm) đã bị xoá vì
lý do này.

**BOM là một cây phẳng, không đệ quy xuống BOM con.** Mỗi sản phẩm có tối đa một `boms` (header), chứa các node `bom_items` lồng nhau qua `parentId` — **thuần cấu trúc sản phẩm/WIP, không còn vật tư**. Node gốc "Cấp 0" **không phải một dòng** — `parentId = null` nghĩa là con trực tiếp của sản phẩm gốc.

Điểm dễ hiểu sai nhất: một node `bom_items` trỏ tới một WIP **có thể có BOM riêng của nó**, nhưng khi đọc cây, hệ thống **không bao giờ đi xuống BOM đó**. "Nhiều cấp" ở đây nghĩa là người dùng tự dựng sâu trong *một* cây, không phải hệ thống tự bung BOM con.

**Routing và vật tư đều "as-used" — thuộc về vị trí trong cấu trúc, không thuộc về sản phẩm.**
`routing_steps` khoá theo **đúng một trong** `productId` (Cấp 0 của chính sản phẩm gốc) **hoặc**
`bomItemId` (đúng một node trong cây). `bom_materials` thì **luôn** khoá theo `bomItemId` — không còn
Cấp 0: một sản phẩm muốn khai vật tư trực tiếp bắt buộc phải có sẵn ít nhất một node `bom_items` để
gắn vào (xem "Common mistakes"). Lý do nghiệp vụ của việc as-used theo vị trí (không theo sản phẩm):
cùng một chi tiết, lắp ở vị trí này thì hàn + cần 2 con ốc, ở vị trí khác thì sơn + không cần ốc
thêm.

**Vật tư của một WIP con không tự động cộng vào cây cha.** Đọc cây cha không đệ quy xuống BOM riêng
của WIP con (đoạn trên) — vật tư "as-used" gắn ở một node trong cây cha là **khai riêng, không tự
suy ra** từ vật tư trên cây BOM riêng của WIP mà node đó tham chiếu (nếu WIP đó có cây riêng).

**Versioning = clone cả sản phẩm, không phải lịch sử phiên bản.** Từng có `product_revisions`, đã bị xoá. Lý do: một biến thể là một sản phẩm mới hẳn, nên sửa BOM/routing về sau không bao giờ làm thay đổi ngược dữ liệu đã nằm trong đơn hàng cũ. `sourceProductId` chỉ ghi lại nguồn gốc để hiển thị, **không tạo ràng buộc gì**.

## Entities

| Entity | Vai trò |
| --- | --- |
| `products` | FG hoặc WIP; `sourceProductId` (nullable, tự trỏ) ghi lineage khi clone |
| `boms` | Header, **đúng một dòng cho mỗi product** (unique `productId`) |
| `bom_items` | Node của cây cấu trúc, tự lồng qua `parentId`; luôn trỏ một WIP (`productId` NOT NULL); `drawingFileId` (nullable) là bản vẽ kỹ thuật riêng của node |
| `bom_materials` | Vật tư as-used; `bomItemId` NOT NULL — luôn gắn đúng một node `bom_items`, không còn Cấp 0 |
| `routing_steps` | Bước công đoạn; khoá theo **đúng một trong** `productId`/`bomItemId` |
| `operations` | Danh mục công đoạn gốc (`INHOUSE`/`OUTSOURCE`), chỉ đọc — xem `docs/domains/partners.md` |

## Lifecycle

`ProductStatus` = `ACTIVE | INACTIVE`, mặc định `ACTIVE`. **Trạng thái này gần như không gác gì** — chỉ màn tồn kho lọc theo nó. Node BOM, dòng đơn hàng và sản xuất đều nhận sản phẩm `INACTIVE`. Coi nó là cờ hiển thị/lọc, không phải cổng nghiệp vụ.

**BOM sinh ra lười, không sinh cùng sản phẩm.** `POST /products` không tạo `boms`. Header chỉ được tạo trong transaction ghi node đầu tiên (get-or-create). Đọc cây của sản phẩm chưa có node trả mảng rỗng — bình thường, không phải lỗi.

Xoá sản phẩm là **xoá mềm và không kiểm tham chiếu**. Các FK `restrict` chỉ chặn xoá cứng, nên xoá mềm luôn thành công dù sản phẩm đang nằm trong BOM hoặc đơn hàng.

## Business rules

- Một node `bom_items` phải trỏ tới WIP (`E053`).
- Mọi node phải có `quantity` nguyên dương — vô điều kiện từ khi vật tư tách ra (trước đây chỉ bắt
  buộc với node `PRODUCT`, `E055`), giờ chặn ngay ở DTO (`@NumberField({ int: true })`), không còn
  là business rule ném `AppException`.
- Node cha phải cùng một BOM với node con.
- `bomItemId` trong route routing/vật tư phải thuộc đúng sản phẩm trên URL — không với sang cây khác
  được. `RoutingService` ném `E062` (routing); `BomMaterialsService` ném `E051` (vật tư, qua
  `BomsService.ensureBomItemInBom` dùng chung — cùng mã đã dùng cho "cha của một node PRODUCT không
  hợp lệ"). Cùng khuôn kiểm tra, khác mã vì khác resource.
- `operationId` **bất biến** sau khi thêm routing: đổi công đoạn = xoá bước rồi thêm lại.
  `materialId` trên một dòng `bom_materials` cũng bất biến, cùng lý do — đổi vật tư = xoá + thêm lại.
- Một chuỗi routing **được phép lặp lại cùng một công đoạn** (hàn → sơn → hàn) — không có ràng buộc
  unique. Một node cũng **được phép khai trùng vật tư** trên hai dòng khác nhau (khác ghi chú) —
  cùng tinh thần.
- Đơn vị tính của sản phẩm phải có scope `PRODUCT` (`E043`).

## Invariants

**DB đảm bảo** (không thể lách kể cả bằng SQL tay): một BOM cho mỗi product; `bom_items.productId`
NOT NULL; `bom_materials.bomItemId` NOT NULL (không còn Cấp 0); `quantity > 0` (cả `bom_items` lẫn
`bom_materials`); routing khoá đúng một trong `productId`/`bomItemId`.

**Chỉ service đảm bảo** (SQL tay lách được): node phải là WIP; cha cùng BOM (cả cho node con lẫn cho
`bomItemId` của vật tư/routing); không có chu trình; độ sâu ≤ 50.

**Không ai đảm bảo** — đừng giả định:

- **Chu trình xuyên cây.** Kiểm chu trình chỉ chạy trong phạm vi *một* cây. BOM của A chứa B, và BOM riêng của B chứa A — hoàn toàn lọt.
- **Node anh em trùng nhau.** Không có unique trên `(bomId, parentId, productId)`; thêm hai node y hệt cạnh nhau là hợp lệ. `bom_materials` cũng không unique trên `(bomItemId, materialId)`.
- **Cột `path` khớp độ sâu thật.** Không đường đọc API nào chạm tới `path` để đối chiếu, nên lệch (nếu có) không ai thấy — khác `level`, giờ đọc thẳng từ cột lưu ra response nên lệch sẽ hiện ngay.

## Cross-domain dependencies

- **Production** đọc **hai nguồn tách biệt**, cả hai **một lần**, lúc duyệt LSX: cây `bom_items`
  (thuần cấu trúc) + `routing_steps` as-used của từng node, nhân bản sang
  `production_job_bom_items`/`production_job_operations` (id mới, độc lập); và `bom_materials` (mọi
  dòng thuộc cây `bom_items` của sản phẩm, gộp theo vật tư), copy sang `production_job_materials`
  của Job — xem `docs/domains/production.md`. Routing Cấp 0 của FG (`routing_steps.productId`)
  **không** được đọc/snapshot ở bước này. Ngoài thời điểm đó, không module sản xuất nào tham chiếu
  `boms`/`bom_items`/`bom_materials`/`routing_steps` nữa; Job không chia nhỏ tiến độ theo công đoạn.
- Phép gộp vật tư (`SUM(quantity) GROUP BY materialId` trên mọi dòng `bom_materials` thuộc cây một
  sản phẩm) — **không nhân qua số lượng của các node cha**, nên nó *không* phải BOM explosion.
  `production_job_materials.unitQty` thừa hưởng nguyên giới hạn này.
- **Inventory** chỉ thấy sản phẩm FG + ACTIVE; WIP không có mặt trong kho. Chiều ngược lại: không xoá
  được vật tư đang nằm trong bất kỳ dòng `bom_materials` nào.
- **Orders** tham chiếu `products.id` trên từng dòng, và cố ý **không snapshot** tên/ảnh — luôn đọc qua quan hệ.

## Common mistakes

1. **Tưởng đọc BOM sẽ đệ quy xuống BOM của WIP con.** Không. Mỗi cây độc lập — và vật tư trên cây
   riêng của một WIP con (nếu có) cũng **không** tự cộng vào cây cha đang tham chiếu nó.
2. **Tưởng `boms` đã tồn tại sau khi tạo sản phẩm.** Chưa. Luôn xử lý trường hợp chưa có, và dùng đúng pattern get-or-create thay vì insert trần.
3. **Coi routing/vật tư là thuộc tính của sản phẩm.** Cả hai sống as-used trên `bom_items.id`; routing
   còn khai được ở Cấp 0 (`productId`, gốc cây), vật tư thì không — sửa một vị trí không được đụng vị
   trí song sinh của nó.
4. **Tin `restrict` sẽ chặn xoá sản phẩm đang được dùng.** Xoá là mềm, nên nó luôn qua; sản phẩm biến khỏi danh sách nhưng vẫn hiện trong join của BOM/đơn hàng. Tệ hơn: **một WIP đã xoá mềm vẫn hiển thị trong cây BOM**, vì join sang `products` khi dựng cây không lọc `deletedAt`.
5. **Xoá một node giữa cây** sẽ cascade sạch cả nhánh con, routing as-used **và vật tư as-used**
   (`bom_materials.bomItemId`) của chúng, không cảnh báo trước, không đếm trước.
6. **Thêm ràng buộc "một node cho mỗi (cha, item)" hoặc chống chu trình xuyên cây vì tưởng đã có.** Cả hai đều chưa có.
7. **Tưởng ảnh (`products.imageFileId`) và bản vẽ (`bom_items.drawingFileId`) là một.** Khác nhau: ảnh
   là ảnh đại diện của sản phẩm, đọc ké vào mọi node BOM trỏ tới WIP đó; bản vẽ là tài liệu kỹ thuật
   riêng của **từng node**, không đọc qua `productId`.
8. **Tưởng clone là đệ quy.** Clone giữ nguyên `productId`/`materialId` của node/dòng vật tư — nó
   **không** clone các WIP/vật tư được tham chiếu, chỉ clone cấu trúc cây + vật tư as-used của chính
   cây đó.
9. **Đi tìm node `MATERIAL` trong `bom_items`.** Không còn — vật tư đã tách hẳn sang `bom_materials`,
   `bom_items` giờ thuần cấu trúc WIP.
10. **Tưởng một WIP thuần vật tư (không có node `bom_items` con nào) khai được vật tư trực tiếp lên
    chính nó.** Không còn — `bom_materials.bomItemId` bắt buộc trỏ một node có thật, và một sản phẩm
    không được tự làm con của chính nó (`E054`) nên không có node nào để tự gắn vào. Một WIP muốn có
    vật tư của riêng mình phải có ít nhất một node con trong cây BOM của chính nó.

## Related docs

- `docs/workflows/product-setup.md` — thứ tự dựng sản phẩm → BOM → công đoạn → nhân bản.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
