# Công đoạn Cấp 0 sang bảng riêng `routing_operations`

**Trạng thái:** còn hiệu lực. Thay thế đúng một phần của
`docs/decisions/bom-header-as-level-0-anchor.md` — mục "công đoạn Cấp 0 neo `bom_operations.bomId`".
`resolveBomAnchor` được nhắc tới bên dưới (giữ lại lúc đó cho `BomConsumablesService`/note) **đã bị
xoá hẳn sau đó** bởi `docs/decisions/level-0-outside-bom-tree-response.md` — đọc doc đó trước khi
đụng vào response `GET /bom` hoặc route consumables/note.

## Bối cảnh

Bản trước (`bom-header-as-level-0-anchor.md`) neo công đoạn Cấp 0 vào `bom_operations.bomId` — cột
nullable song song `bomItemId`, CHECK `chk_bom_operations_anchor` ép đúng một trong hai luôn có giá
trị ("exclusive arc", kỹ thuật DB modeling chuẩn cho một dòng tham chiếu đúng 1 trong 2 bảng cha
khác nhau, vì Postgres không có polymorphic FK). Thiết kế này giữ đúng 1 bảng, 1 route
(`items/:itemId/bom/items/:bomItemId/operations`, segment nhận cả `bom_items.id` lẫn anchor
`boms.id`), tránh đúng vấn đề mà `docs/decisions/root-bom-item.md` đã ghi nhận khi có 2 bảng
`routings`/`routing_operations` song song trước đây (route/service/FE type phải rẽ nhánh khắp nơi).

Sau khi cân nhắc, người dùng thấy cột kép + CHECK XOR trên cùng 1 bảng khó đọc hơn 2 bảng tách biệt
rõ nghĩa. Đã trình bày đầy đủ đánh đổi (tách bảng tái tạo đúng vấn đề route/service/FE type nhân đôi
mà `root-bom-item.md` cảnh báo) hai lần — người dùng xác nhận vẫn muốn tách, chấp nhận đánh đổi đó.
**Đây là quyết định đọc-hiểu (readability), không phải phát hiện lỗi kỹ thuật mới** ở thiết kế
`bomId` exclusive-arc — thiết kế đó vẫn đúng, chỉ không phải lựa chọn người dùng muốn sống với nó.

## Quyết định

**Công đoạn Cấp 0 sang bảng riêng `routing_operations`** — khác bản `routings` gốc (trước
`root-bom-item.md`) ở đúng một điểm quan trọng: **không có header `routings` riêng**. Bản gốc cần
header đó vì lúc ấy chưa có "header Cấp 0" nào khác; nay `boms` (unique `itemId`) đã đóng đúng vai
trò đó, nên bảng mới chỉ là 1 bảng con, `bomId NOT NULL` → `boms.id` cascade — không dựng lại toàn
bộ cấu trúc header+child đã bị xoá.

- `bom_operations` **trở lại nguyên trạng trước `bom-header-as-level-0-anchor.md`**: chỉ
  `bomItemId NOT NULL`, không còn `bomId`/`chk_bom_operations_anchor`. Chỉ gắn được vào node
  `bom_items` COMPONENT.
- `routing_operations` (mới): `bomId NOT NULL` → `boms.id`, `operationId`, `type`, `sortOrder`,
  `note`, `createdBy`, timestamps — y hệt shape `bom_operations`. Không unique
  `(bomId, operationId)` (cùng lý do `bom_operations`).
- **Route mới, tách hẳn**: `items/:itemId/operations` (đúng route lịch sử trước
  `root-bom-item.md`) — không có segment node, vì Cấp 0 không phải một node.
  `RoutingsController`/`RoutingsService`/`RoutingsModule` (`src/api/routings/`), import `BomsModule`.
  `BomOperationsController`/`Service` (route cũ `.../bom/items/:bomItemId/operations`) không đổi gì
  ngoài việc bớt nhánh Cấp 0 — quay lại dùng thẳng `ensureBomItemInBom`, không còn qua
  `resolveBomAnchor`.
- `resolveBomAnchor` (`BomsService`) giữ nguyên ở bước này — vẫn cần cho `BomConsumablesService`
  (vật tư trực tiếp dưới Cấp 0 là sự thật của `bom_items.parentId IS NULL`, không liên quan gì tới
  quyết định này) và cho `PATCH|DELETE .../bom/items/:id` (note/xoá anchor Cấp 0). Bị xoá hẳn sau
  đó bởi `docs/decisions/level-0-outside-bom-tree-response.md`.
- `BomsService.getOrCreateBom` đổi thành **public** `getOrCreateBomId` — `RoutingsService` dùng lại
  y hệt cách `BomsService.createBomItem` dùng để sinh `boms` header lười lúc ghi công đoạn Cấp 0
  đầu tiên của một item chưa từng có BOM/routing.
- **Không ErrorCode mới**: `E111` (item CONSUMABLE không có BOM/routing) đã có sẵn — comment của nó
  từ trước đã nhắc "RoutingsService". "Step không tồn tại" dùng lại `E109`
  (`bom_operation.error.not_found`, tên chung — cùng tiền lệ `E050` dùng chung cho 2 loại node
  `bom_items`). Không có "anchor not found" cho route mới — không có segment node để sai.
- `BomsService.getBomItem` đọc operations của dòng Cấp 0 ảo từ `routing_operations` (theo `bomId`),
  node COMPONENT/CONSUMABLE vẫn từ `bom_operations` (theo `bomItemId`) — 2 query riêng, gộp vào
  cùng field `operations` của response lúc map DTO.
- `production-job-snapshot.query.ts`: điều kiện tạo node FG (`itemType='FG'`) đổi thành "có
  `routing_operations` nào theo `bomId` không"; copy công đoạn sang `production_job_operations` đọc
  2 nguồn (`bom_operations` theo `bomItemId`, `routing_operations` theo `bomId`), gộp trước khi
  insert.
- `ItemsService.copyBomTree`: copy `bom_operations` (chỉ khi có node mới, theo `bomItemId` map) và
  copy `routing_operations` (theo `bomId` nguồn) là **2 bước độc lập** — không còn 1 query gộp `OR`
  như bản `bomId` exclusive-arc.

## Migration

`drizzle/0193_high_roland_deschain.sql`: tạo `routing_operations` → **backfill**
(`INSERT ... SELECT ... FROM bom_operations WHERE bom_id IS NOT NULL`) → xoá các dòng đó khỏi
`bom_operations` → drop `chk_bom_operations_anchor` → drop FK/index/cột `bom_id` → `bom_item_id`
lại `NOT NULL` (an toàn vì mọi dòng còn lại đều có `bomItemId`, các dòng neo `bomId` đã chuyển đi ở
bước backfill) → thêm FK/index cho `routing_operations`.

## Đừng hoàn lại

**Đừng gộp công đoạn Cấp 0 trở lại `bom_operations` bằng cột nullable + CHECK XOR nữa** — đã thử
đúng thiết kế đó (`bom-header-as-level-0-anchor.md`), đã đảo lại, đây là lần đảo thứ hai của cùng
một trục "1 bảng exclusive-arc" ↔ "2 bảng tách biệt". Nếu tương lai có lý do kỹ thuật mới (không
phải sở thích đọc-hiểu) muốn gộp lại, viết rõ lý do đó trong một quyết định mới — đừng lặp lại mà
không có lý do mới.

## Related docs

- `docs/decisions/bom-header-as-level-0-anchor.md` — phần "Cấp 0 không phải một dòng `bom_items`"
  vẫn hiệu lực, doc này chỉ thay phần công đoạn.
- `docs/decisions/level-0-outside-bom-tree-response.md` — bước tiếp theo cùng hướng, xoá luôn dòng
  Cấp 0 ảo + `resolveBomAnchor` + `boms.note`.
- `docs/decisions/root-bom-item.md` — lý lẽ gốc về vì sao từng gộp `routings` vào `bom_items`/
  `bom_operations`; không mâu thuẫn với quyết định này (Cấp 0 vẫn không phải một node `bom_items`,
  chỉ công đoạn của nó chuyển bảng).
- `docs/decisions/routing-operation-type-per-attachment.md` — `type` per-attachment giờ sống trên
  cả `bom_operations` lẫn `routing_operations`.
- `docs/domains/product-structure.md`, `docs/architecture.md`, `docs/workflows/product-setup.md`.
