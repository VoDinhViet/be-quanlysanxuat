# Product Structure (Sản phẩm — BOM — Công đoạn)

## Purpose

Mô tả **một sản phẩm được làm từ gì và đi qua những bước nào**: cây cấu trúc (BOM) và chuỗi công đoạn (routing). Đây là dữ liệu nền cho sản xuất — nhưng xem mục "Cross-domain" trước khi giả định nó đã được dùng để tính nhu cầu vật tư.

## Core concepts

**Một bảng `products` chứa cả thành phẩm lẫn bán thành phẩm.** `type` là `FINISHED_GOOD` (FG) hoặc `WORK_IN_PROGRESS` (WIP). Khác biệt hành vi rất hẹp — chỉ ba chỗ: một node PRODUCT trong BOM bắt buộc phải là WIP (FG không bao giờ làm con ai), màn tồn kho chỉ liệt kê FG, và dòng phiếu nhập/xuất thành phẩm chỉ nhận FG. Mọi thứ còn lại (ảnh, đính kèm, BOM riêng, routing riêng, clone) hai loại như nhau — **một WIP hoàn toàn có BOM và routing của chính nó**.

**BOM là một cây phẳng, không đệ quy xuống BOM con.** Mỗi sản phẩm có tối đa một `boms` (header), chứa các node `bom_items` lồng nhau qua `parentId`. Node gốc "Cấp 0" **không phải một dòng** — `parentId = null` nghĩa là con trực tiếp của sản phẩm gốc. Node có hai loại: `PRODUCT` (một WIP) hoặc `MATERIAL` (vật tư, lá).

Điểm dễ hiểu sai nhất: một node `PRODUCT` trỏ tới một WIP **có thể có BOM riêng của nó**, nhưng khi đọc cây, hệ thống **không bao giờ đi xuống BOM đó**. "Nhiều cấp" ở đây nghĩa là người dùng tự dựng sâu trong *một* cây, không phải hệ thống tự bung BOM con.

**Routing là "as-used" — thuộc về vị trí trong cấu trúc, không thuộc về sản phẩm.** Một bước routing khoá theo **hoặc** `productId` (routing Cấp 0 của chính sản phẩm gốc) **hoặc** `bomItemId` (routing của đúng một node). Lý do nghiệp vụ: cùng một chi tiết, lắp ở vị trí này thì hàn, ở vị trí khác thì sơn. Nếu routing là thuộc tính của sản phẩm thì mọi nơi dùng nó buộc phải chung một chuỗi công đoạn, và bản thân FG gốc sẽ không có chỗ để đặt các bước của mình.

**Versioning = clone cả sản phẩm, không phải lịch sử phiên bản.** Từng có `product_revisions`, đã bị xoá. Lý do: một biến thể là một sản phẩm mới hẳn, nên sửa BOM/routing về sau không bao giờ làm thay đổi ngược dữ liệu đã nằm trong đơn hàng cũ. `sourceProductId` chỉ ghi lại nguồn gốc để hiển thị, **không tạo ràng buộc gì**.

## Entities

| Entity | Vai trò |
| --- | --- |
| `products` | FG hoặc WIP; `sourceProductId` (nullable, tự trỏ) ghi lineage khi clone |
| `boms` | Header, **đúng một dòng cho mỗi product** (unique `productId`) |
| `bom_items` | Node của cây, tự lồng qua `parentId`; trỏ **đúng một trong** `productId`/`materialId` |
| `routing_steps` | Bước công đoạn; khoá theo **đúng một trong** `productId`/`bomItemId` |
| `operations` | Danh mục công đoạn gốc (`INHOUSE`/`OUTSOURCE`), chỉ đọc — xem `docs/domains/partners.md` |

## Lifecycle

`ProductStatus` = `ACTIVE | INACTIVE`, mặc định `ACTIVE`. **Trạng thái này gần như không gác gì** — chỉ màn tồn kho lọc theo nó. Node BOM, dòng đơn hàng và sản xuất đều nhận sản phẩm `INACTIVE`. Coi nó là cờ hiển thị/lọc, không phải cổng nghiệp vụ.

**BOM sinh ra lười, không sinh cùng sản phẩm.** `POST /products` không tạo `boms`. Header chỉ được tạo trong transaction ghi node đầu tiên (get-or-create). Đọc cây của sản phẩm chưa có node trả mảng rỗng — bình thường, không phải lỗi.

Xoá sản phẩm là **xoá mềm và không kiểm tham chiếu**. Các FK `restrict` chỉ chặn xoá cứng, nên xoá mềm luôn thành công dù sản phẩm đang nằm trong BOM hoặc đơn hàng.

## Business rules

- Một node `PRODUCT` phải trỏ tới WIP (`E053`); node `MATERIAL` luôn là lá, không có con.
- Node WIP phải có `quantity` nguyên (`E055`); mọi node phải `quantity > 0`.
- Node cha phải cùng một BOM với node con.
- Chỉ node `PRODUCT` mới gắn được routing (`E063`) — vật tư không có công đoạn.
- `bomItemId` trong route routing phải thuộc đúng sản phẩm trên URL (`E062`) — không với sang cây khác được.
- `operationId` **bất biến** sau khi thêm: đổi công đoạn = xoá bước rồi thêm lại.
- Một chuỗi routing **được phép lặp lại cùng một công đoạn** (hàn → sơn → hàn) — không có ràng buộc unique.
- Đơn vị tính của sản phẩm phải có scope `PRODUCT` (`E043`).

## Invariants

**DB đảm bảo** (không thể lách kể cả bằng SQL tay): một BOM cho mỗi product; node trỏ đúng một trong `productId`/`materialId`; `quantity > 0`; routing khoá đúng một trong `productId`/`bomItemId`.

**Chỉ service đảm bảo** (SQL tay lách được): node PRODUCT phải là WIP; số lượng WIP phải nguyên; MATERIAL là lá; cha cùng BOM; không có chu trình; độ sâu ≤ 50; MATERIAL không mang routing.

**Không ai đảm bảo** — đừng giả định:

- **Chu trình xuyên cây.** Kiểm chu trình chỉ chạy trong phạm vi *một* cây. BOM của A chứa B, và BOM riêng của B chứa A — hoàn toàn lọt.
- **Node anh em trùng nhau.** Không có unique trên `(bomId, parentId, productId)`; thêm hai node y hệt cạnh nhau là hợp lệ.
- **Cột `level`/`path` khớp độ sâu thật.** `level` trong response được **tính lại lúc đọc**, nên nếu cột lưu bị lệch cũng không ai thấy — cho tới khi có người query thẳng `path`.

## Cross-domain dependencies

**Điều quan trọng nhất: hiện chưa có gì bung BOM ra để tính nhu cầu vật tư.**

- **Production** chỉ nhận từ domain này đúng `products.id` + một số lượng. Không module sản xuất nào tham chiếu `boms`/`bom_items`/`routing_steps`. Job không có chia nhỏ theo công đoạn.
- `GET /products/:id/bom/materials` là một phép `SUM` gộp theo vật tư trên mọi node MATERIAL ở mọi độ sâu — **không nhân qua số lượng của các node cha**, nên nó *không* phải BOM explosion.
- **Inventory** chỉ thấy sản phẩm FG + ACTIVE; WIP không có mặt trong kho. Chiều ngược lại: không xoá được vật tư đang nằm trong bất kỳ node BOM nào.
- **Orders** tham chiếu `products.id` trên từng dòng, và cố ý **không snapshot** tên/ảnh — luôn đọc qua quan hệ.

## Common mistakes

1. **Tưởng đọc BOM sẽ đệ quy xuống BOM của WIP con.** Không. Mỗi cây độc lập.
2. **Tưởng `boms` đã tồn tại sau khi tạo sản phẩm.** Chưa. Luôn xử lý trường hợp chưa có, và dùng đúng pattern get-or-create thay vì insert trần.
3. **Coi routing là thuộc tính của sản phẩm.** Routing của một node sống trên `bom_items.id` — sửa một vị trí không được đụng vị trí song sinh của nó.
4. **Tin `restrict` sẽ chặn xoá sản phẩm đang được dùng.** Xoá là mềm, nên nó luôn qua; sản phẩm biến khỏi danh sách nhưng vẫn hiện trong join của BOM/đơn hàng. Tệ hơn: **một WIP đã xoá mềm vẫn hiển thị trong cây BOM**, vì join sang `products` khi dựng cây không lọc `deletedAt`.
5. **Xoá một node giữa cây** sẽ cascade sạch cả nhánh con **và** routing as-used của chúng, không cảnh báo trước, không đếm trước.
6. **Thêm ràng buộc "một node cho mỗi (cha, item)" hoặc chống chu trình xuyên cây vì tưởng đã có.** Cả hai đều chưa có.
7. **Quên `drawingFileId` khi copy dòng.** Đây là **bug đang tồn tại**: `cloneBomTree` không sao chép `drawingFileId`, nên `POST /products/:id/copy` **âm thầm làm mất bản vẽ kỹ thuật của mọi node**. Chưa được sửa tại thời điểm viết tài liệu này.
8. **Tưởng clone là đệ quy.** Clone giữ nguyên `productId`/`materialId` của node — nó **không** clone các WIP/vật tư được tham chiếu, chỉ clone cấu trúc cây.

## Related docs

- `docs/features/products.md`, `boms.md`, `routing.md` — API contract, error code.
- `docs/features/master-data.md` — danh mục `operations`.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
