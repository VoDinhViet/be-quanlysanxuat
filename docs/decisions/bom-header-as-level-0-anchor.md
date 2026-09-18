# Cấp 0 không còn là một dòng `bom_items` — neo qua `boms` header

**Trạng thái:** còn hiệu lực **chỉ cho phần "Cấp 0 không phải một dòng `bom_items`"** — thay thế
`docs/decisions/root-bom-item.md` (Cấp 0 = node `ROOT` thật trong `bom_items`). Hai phần còn lại
của doc này **đã bị thay thế**, giữ nguyên văn làm lịch sử, không áp dụng nữa:

- "công đoạn Cấp 0 neo `bom_operations.bomId`" → `docs/decisions/routing-operations-table.md`
  (bảng riêng `routing_operations`).
- "`GET /bom` dựng dòng Cấp 0 ảo", "`resolveBomAnchor` cho consumables/note", "`boms.note`" →
  `docs/decisions/level-0-outside-bom-tree-response.md` (Cấp 0 không xuất hiện trong response này
  dưới bất kỳ hình thức nào nữa).

Đọc 2 doc mới trước khi đụng vào công đoạn hoặc response Cấp 0.

## Bối cảnh

Sau `root-bom-item.md`, Cấp 0 (chính item FG) là một dòng `bom_items` thật (`type = 'ROOT'`), tồn
tại chủ yếu để công đoạn Cấp 0 (`bom_operations`) có id mà gắn vào — vì bảng đó chỉ có một FK
(`bomItemId`). Đánh giá lại: FG "chỉ bổ sung công đoạn" (không có `code`/`name`/`unit`/`image` riêng
— luôn đọc qua join `items`, không phải lá cấu trúc, không có định mức) nên lưu nguyên một dòng
`bom_items` cho nó là dư — mọi field thật sự cần chỉ là "công đoạn nào gắn vào Cấp 0 của bom nào".

## Quyết định

**Cấp 0 không còn là một dòng `bom_items`.** `bom_items` chỉ còn 2 hình dạng (COMPONENT/CONSUMABLE,
`chk_bom_items_node_shape` rút về 2 nhánh); `parent_id IS NULL` hợp lệ trở lại, nghĩa là "ngay dưới
Cấp 0" (trước đây bị cấm vì mọi node phải có cha thật, kể cả ROOT).

- ~~Công đoạn Cấp 0 neo `bom_operations.bomId`~~ — **đã thay bằng bảng riêng `routing_operations`**,
  xem `docs/decisions/routing-operations-table.md`. Đoạn dưới đây là lịch sử, không còn đúng.
- ~~`GET /items/:itemId/bom` dựng dòng Cấp 0 ảo~~ ở đầu mảng trả về (`id = boms.id`,
  `type = 'ROOT'`, `parentId = null`, `level = 0`, `quantity = 1`, `path = []`, code/name/revision/
  unit/image đọc thẳng từ item FG, node top-level re-parent vào `boms.id`) — **đã bỏ hẳn**, xem
  `docs/decisions/level-0-outside-bom-tree-response.md`. `GET /bom` giờ chỉ trả node thật.
- ~~Route `.../bom/items/:bomItemId/consumables`, `PATCH|DELETE .../bom/items/:id` nhận cả
  `bom_items.id` thật lẫn anchor Cấp 0 (`boms.id`), giải bằng `resolveBomAnchor`~~ — **đã bỏ**,
  `resolveBomAnchor` xoá hẳn, `:bomItemId` giờ luôn là node thật. Xem doc mới.
- ~~`boms` thêm cột `note`~~ — **đã xoá cột này** (migration `0194`), cùng doc mới. Feature "note
  Cấp 0" không còn.
- ~~`DELETE .../bom/items/:bomsId` (anchor Cấp 0) → luôn `E271`~~ — không còn ý nghĩa, `:bomItemId`
  không bao giờ khớp `boms.id` nữa (không phải giá trị id nào trong `bom_items`).
- `ensureBomItemNotDuplicate`/`ensureBomItemIsLeaf`/`deleteConsumableChildren` dựng lại nhánh
  `parentId IS NULL` (Postgres NULL ≠ NULL qua `=`) — nhánh này từng bị xoá lúc có ROOT
  (`root-bom-item.md`), nay cần lại vì `parent_id NULL` là trạng thái hợp lệ. **Vẫn đúng.**
- `bom_items` unique index tách lại theo `parent_id IS NULL`/`IS NOT NULL`
  (`uq_bom_items_bom_item_no_parent`, `uq_bom_items_bom_parent_item`) — đúng cặp partial index từ
  trước `root-bom-item.md` (`drizzle/0151_old_rocket_raccoon.sql`). **Vẫn đúng.**
- ~~`ItemsService.copyBomTree` copy công đoạn Cấp 0 theo `bomId` nguồn (điều kiện gộp `OR`...)~~ —
  đã đổi thành 2 bước copy độc lập (`bom_operations` rồi `routing_operations`). ~~`boms.note` vẫn
  copy theo~~ — cột đã xoá, không còn gì để copy.
- ~~`production-job-snapshot.query.ts`: điều kiện tạo node FG là "bom có `bom_operations.bomId`
  nào không"~~ — đã đổi thành đọc `routing_operations.bomId`, xem doc mới. Việc node FG đọc
  code/name/image thẳng từ `items` (không phải từ dòng ROOT nguồn) **vẫn đúng**.

## Migration

`drizzle/0192_spotty_leech.sql` — một file (không tách như `0181`/`0182` vì không cần thêm giá trị
enum mới): drop CHECK cũ → thêm `bom_operations.bom_id` + FK, bỏ `NOT NULL` trên `bom_item_id` →
**backfill**: di dời `bom_operations` của các dòng ROOT sang `bom_id` (trước khi xoá, để không mất
dữ liệu qua cascade) → null hoá `parent_id` của con trực tiếp ROOT → xoá các dòng ROOT → đổi lại 2
unique index → thêm CHECK 2 nhánh + `chk_bom_operations_anchor` → thêm `boms.note`. `BomType.ROOT`
**giữ lại** trong enum (Postgres không xoá được giá trị enum đã thêm) nhưng không còn dòng nào mang
giá trị này — chỉ dùng cho response DTO.

`bom_operations.bomId`/`chk_bom_operations_anchor` sinh ra ở migration này sau đó bị gỡ lại đúng 1
ngày sau bởi `drizzle/0193_high_roland_deschain.sql` — xem `docs/decisions/routing-operations-table.md`.

## Đừng hoàn lại

- Đừng lưu lại Cấp 0 thành một dòng `bom_items` — đã cân nhắc cả hai hướng (xem Bối cảnh), chốt neo
  qua `boms` header vì FG không có field cấu trúc nào thật sự cần một dòng riêng, chỉ cần chỗ gắn
  công đoạn. **Điều này vẫn đúng** dù công đoạn Cấp 0 sau đó chuyển sang bảng riêng — hai quyết định
  độc lập nhau.
- Nếu Cấp 0 cần thêm field riêng trong tương lai (ngoài công đoạn, đã có bảng riêng), thêm cột vào
  `boms` và đọc/ghi qua route riêng theo `itemId` (không phải nữa qua `GET /bom` — xem
  `docs/decisions/level-0-outside-bom-tree-response.md`), không hồi sinh dòng `bom_items` type
  ROOT.

## Related docs

- `docs/decisions/root-bom-item.md` (đã bị thay thế bởi quyết định này).
- `docs/decisions/routing-operations-table.md` — thay thế phần "công đoạn Cấp 0 neo `bomId`" của
  chính doc này.
- `docs/decisions/level-0-outside-bom-tree-response.md` — thay thế phần "dòng ảo"/`resolveBomAnchor`/
  `boms.note` của chính doc này; phần "Cấp 0 không phải một dòng `bom_items`" vẫn do doc này sở hữu.
- `docs/decisions/oqc-per-operation.md` — node FG (`itemType = 'FG'`) trong
  `production_job_bom_items` giữ nguyên vai trò, chỉ đổi nguồn đọc.
- `docs/decisions/bom-explosion-in-job-demand.md` — nổ cấp BOM cho nhu cầu vật tư Job, không đổi bởi
  quyết định này.
- `docs/domains/product-structure.md` — bất biến `bom_items`/`bom_operations` cập nhật theo đây.
