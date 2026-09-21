# Cấp 0 không còn xuất hiện trong `GET /items/:itemId/bom`

**Trạng thái:** còn hiệu lực. Thay thế phần "dòng Cấp 0 ảo" + "`resolveBomAnchor` cho
consumables/note" + `boms.note` của `docs/decisions/bom-header-as-level-0-anchor.md`. Phần còn lại
của doc đó (Cấp 0 không phải một dòng `bom_items`) **không đổi** — quyết định này chỉ đi xa hơn:
không chỉ "không phải một dòng thật", mà "không xuất hiện trong response này dưới bất kỳ hình thức
nào, kể cả dòng dựng ảo lúc đọc".

## Bối cảnh

Bản trước dựng một dòng Cấp 0 **ảo** ở đầu mảng `GET /items/:itemId/bom` (`id = boms.id`,
`type = 'ROOT'`, `parentId = null`) để giữ nguyên hợp đồng API cũ (từ thời Cấp 0 còn là một dòng
`bom_items` thật, `docs/decisions/root-bom-item.md`) — FE không phải đổi cách đọc response. Cái giá
là `BomsService.getBomItem` phải tự dựng dòng đó (đọc thêm `items`/`units`/`files` của FG), re-parent
node top-level vào `id` ảo đó trước khi tính `path`, và `resolveBomAnchor` phải tồn tại để hai route
khác (`PATCH|DELETE .../bom/items/:id`, `.../consumables`) nhận được cả `bom_items.id` thật lẫn
anchor `boms.id`.

Sau khi tách xong công đoạn Cấp 0 sang bảng riêng (`routing-operations-table.md`), người dùng đánh
giá lại: FE hoàn toàn có thể lấy thông tin Cấp 0 qua `GET /items/:itemId` (đã có sẵn, không cần
route mới) và công đoạn Cấp 0 qua `GET /items/:itemId/operations` (route đã dựng ở quyết định
trước) — không cần `GET /bom` phải "giả vờ" Cấp 0 là một phần tử trong cây nữa. **Đây là quyết định
đơn giản hoá tiếp theo cùng hướng với việc tách `routing_operations`, không phải phát hiện lỗi kỹ
thuật** — dòng ảo trước đó vẫn đúng, chỉ không còn là thiết kế người dùng muốn giữ.

## Quyết định

- **`GET /items/:itemId/bom` chỉ trả node `bom_items` thật** (`COMPONENT`/`CONSUMABLE`) — không còn
  dòng Cấp 0 ảo nào. `BomsService.getBomItem` bỏ hẳn truy vấn `items`/`units`/`files` của FG và
  logic re-parent; node top-level giữ nguyên `parentId: null` (không dịch sang `boms.id` nữa).
- **`buildBomItemPaths` (`bom-tree.util.ts`) đổi từ "cây một gốc" sang "rừng nhiều gốc"**: trước
  đây hàm tìm đúng 1 node `parentId === null` làm gốc (`path = []`) rồi đệ quy; giờ **mọi** node
  `parentId === null` là anh em của nhau ở cấp cao nhất, path bắt đầu từ `[1]` (đệ quy từ khoá
  `null` thay vì từ 1 node gốc cụ thể). Không còn khái niệm `path = []`.
- **Bỏ cột `boms.note`** — feature "note cho Cấp 0" gắn liền với việc FE có `boms.id` trong tay từ
  dòng ảo; bỏ dòng ảo thì FE hết đường lấy id đó để gọi `PATCH`. Không thay bằng cơ chế nào khác —
  người dùng chọn bỏ hẳn feature này thay vì lộ `boms.id` qua đường khác.
- **`BomsService.resolveBomAnchor` bị xoá hoàn toàn** — không còn route nào cần "giải URL segment
  thành 1 trong 2 loại id" nữa:
  - `PATCH|DELETE .../bom/items/:bomItemId`: `:bomItemId` giờ luôn là một `bom_items.id` thật.
    `updateBomItem`/`deleteBomItem` bỏ hẳn nhánh `if (bomItemId === bom.id)`.
  - `.../bom/items/:bomItemId/consumables`: cùng lý do, `:bomItemId` luôn là node thật. Vật tư gắn
    trực tiếp dưới Cấp 0 (`bom_items.parentId IS NULL`) **vẫn đọc được** — qua chính
    `GET /items/:itemId/bom` (đã trả node CONSUMABLE với `parentId: null`), không cần route phân
    trang riêng cho trường hợp này nữa.
- **`CreateBomItemReqDto.parentId`** không còn nhận `boms.id` làm giá trị hợp lệ — chỉ nhận
  `bom_items.id` thật hoặc omit/null (con trực tiếp của Cấp 0).
- **`ensureNodePayloadValid`** (chặn `type = ROOT` lúc tạo node) **giữ nguyên** — `BomType.ROOT` vẫn
  còn trong enum (Postgres không xoá được giá trị đã thêm) nhưng giờ không còn nơi nào trả nó ra
  response nữa (trước đây dòng ảo trả `type: 'ROOT'`).

## Migration

`drizzle/0194_old_havok.sql`: `ALTER TABLE boms DROP COLUMN note` — không cần bước data (cột
nullable, không có ràng buộc phụ thuộc).

## Đừng hoàn lại

- Đừng dựng lại dòng Cấp 0 ảo trong `GET /bom` để "giữ hợp đồng API cũ" — đã cân nhắc, người dùng
  chọn tách hẳn: Cấp 0 đọc qua `GET /items/:itemId`, không qua route này.
- Đừng hồi sinh `boms.note`/`resolveBomAnchor` chỉ để có chỗ neo — nếu Cấp 0 cần thêm field riêng
  trong tương lai, thêm cột vào `boms` và route riêng đọc thẳng theo `itemId` (như
  `RoutingsService` đã làm cho công đoạn), không phải lộ `boms.id` qua `GET /bom` nữa.

## Related docs

- `docs/decisions/bom-header-as-level-0-anchor.md` — phần "Cấp 0 không phải một dòng `bom_items`"
  vẫn đúng; phần "dòng ảo"/`resolveBomAnchor`/`boms.note` do doc này thay thế.
- `docs/decisions/routing-operations-table.md` — bước trước, tách công đoạn Cấp 0 sang
  `routing_operations`; quyết định này là bước tiếp theo cùng hướng.
- `docs/domains/product-structure.md`, `docs/architecture.md`, `docs/workflows/product-setup.md`.
