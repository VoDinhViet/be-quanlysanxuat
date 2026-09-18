# Cấp 0 (ROOT) thành một dòng `bom_items` thật

**Trạng thái:** đã bị thay thế bởi `docs/decisions/bom-header-as-level-0-anchor.md` — Cấp 0 không
còn là một dòng `bom_items`. File này **vẫn còn hiệu lực** ở phần "Đừng hoàn lại": đừng dựng lại
bảng `routings`/`routing_operations` song song — lý lẽ và bài học ở phần Bối cảnh dưới đây vẫn
đúng nguyên vẹn cho quyết định thay thế. Tên `PART`/`RM` dùng trong file này lúc quyết định đã đổi
thành `COMPONENT`/`CONSUMABLE` sau đó (`docs/decisions/material-to-consumable-rename.md`, 2026-09).

## Bối cảnh

Trước quyết định này, "Cấp 0" của cây BOM — chính item FG — không phải một dòng trong
`bom_items`: top-level COMPONENT/CONSUMABLE mang `parentId = null`, và công đoạn as-used của chính FG
(lắp ráp/đóng gói cuối cùng) sống ở một bộ bảng/module hoàn toàn song song —
`routings`/`routing_operations`/`RoutingsController`/`RoutingsService`, route
`items/:itemId/operations`. Comment trong chính code cũ đã tự nhận đây là bản sao gần như y hệt:
*"Cùng khuôn `boms`/`bom_items`"*, *"Cùng khuôn `bom_operations`"* — chỉ tồn tại vì Cấp 0 không
khớp hình dạng COMPONENT/CONSUMABLE mà `chk_bom_items_node_shape` bắt buộc.

Hệ quả: mọi nơi cần đọc/ghi công đoạn của cả Cấp 0 lẫn COMPONENT đều phải tự rẽ nhánh theo 2 đường
riêng (route, service, bảng khác nhau) — ở frontend (`web-qlsx-start`) lộ rõ thành
`OperationsTarget.bomItemId?: string` optional xuyên suốt `use-product-operations.ts`, một type
`RootOperations` riêng, một query riêng (`itemOperationsQueryOptions`), và bảng cấu trúc phải tự
dựng một `<TableRow id="root">` viết tay thay vì chỉ là một hàng dữ liệu bình thường.

## Quyết định

**Cấp 0 ("ROOT") là một dòng `bom_items` thật, đúng 1 dòng mỗi `bom`.** `BomType` thêm giá trị
thứ 3 `ROOT`, mirror cách CONSUMABLE trỏ `itemId` (đọc `code`/`name`/`unit`/`image` qua join với `items`,
không lưu trực tiếp trên dòng) nhưng không phải lá — nhận COMPONENT/CONSUMABLE làm con trực tiếp và gắn được
`bom_operations` như COMPONENT. Sinh tự động cùng lúc với `boms` header (`BomsService.getOrCreateBom`)
— một `boms` row không bao giờ tồn tại mà thiếu ROOT. Không tạo/sửa-tự-do/xoá được qua API
`bom-items` thường (`type`/`quantity`/`sortOrder` cố định `ROOT`/`1`/`0`; chỉ `note` sửa được).

- Mọi node khác ROOT giờ **luôn có `parentId` thật** — không còn dòng nào (ngoài chính ROOT)
  mang `parentId = null`. Top-level COMPONENT/CONSUMABLE cũ được repoint vào `parentId = <id ROOT>` (migration
  data, xem dưới); `level` giữ nguyên ý nghĩa (ROOT = 0, con trực tiếp = 1, …).
- Xoá hẳn `routings`/`routing_operations`/`RoutingsController`/`RoutingsService`. Công đoạn Cấp 0
  đi qua đúng route `bom-operations` (`items/:itemId/bom/items/:bomItemId/operations`) mà COMPONENT
  đã dùng, với `bomItemId` = id dòng ROOT — **module `bom-operations` không cần sửa gì**.
- `ensureBomItemNotDuplicate` không còn cần nhánh `parentId = null` riêng (Postgres NULL ≠ NULL) —
  một index `(bom_id, parent_id, item_id)` phẳng là đủ.
- `production-jobs` (`createJobBomItems`): snapshot
  (`production_job_bom_items`) **cố tình lọc bỏ ROOT** — Job vẫn giữ quy ước cũ, một node
  `itemType = FG` riêng do cùng hàm đó tạo (xem
  `docs/decisions/oqc-per-operation.md` mục "Đừng hoàn lại"), không lẫn với COMPONENT/CONSUMABLE.
  Node FG đổi nguồn đọc từ `routings`/`routing_operations` sang node ROOT của
  `bom_items` + `bom_operations`, giữ nguyên cấu trúc/output hàm.
- Item clone (`ItemsService.copyBomTree`) hưởng lợi phụ: đã clone mọi dòng `sourceBomItems` kèm
  `bom_operations` qua map `newIdByOldId` một cách tổng quát — ROOT giờ nằm trong đó nên copy sản
  phẩm **tự động nhân bản luôn công đoạn Cấp 0**, điều mà code cũ không làm (gap có sẵn, không
  phải side-effect cố ý mới).

## Migration

Tách 2 file (theo đúng tiền lệ `0085_rename_bom_item_materials_to_bom_materials.sql` — hand-written
khi cần xen data migration giữa các bước DDL):

- `0181_add_bom_type_root.sql` — chỉ `ALTER TYPE bom_node_type ADD VALUE 'ROOT'`, tách riêng vì
  Postgres không cho dùng giá trị enum mới thêm trong cùng transaction đã thêm nó.
- `0182_merge_routing_into_bom_operations.sql` — bỏ constraint hình dạng cũ trước (để insert được
  ROOT) → bù `boms` header cho item chỉ có routing Cấp 0 mà chưa từng có `bom_items` → insert
  đúng 1 dòng ROOT mỗi bom → repoint top-level cũ vào ROOT → di dời `routing_operations` sang
  `bom_operations` → xoá bảng cũ → đổi index/constraint sang hình dạng 3 nhánh.

## Đừng hoàn lại

Đừng quay về một bảng `routings`/`routing_operations` song song "cho đơn giản" — đó chính xác là
trạng thái đã gây ra bản sao cấu trúc và rẽ nhánh optional khắp nơi mà quyết định này xoá bỏ. Nếu
Cấp 0 cần thêm field riêng trong tương lai, thêm vào `bom_items` (nullable, chỉ ROOT dùng — giống
cách `code`/`name` chỉ COMPONENT dùng), không tách bảng mới.

## Related docs

- `docs/decisions/bom-explosion-in-job-demand.md` — nổ cấp BOM cho nhu cầu vật tư Job, không đổi
  bởi quyết định này (route `GET /items/:itemId/bom` vẫn trả nguyên hình dạng cây, chỉ thêm dòng
  ROOT).
- `docs/decisions/oqc-per-operation.md` mục "Đừng hoàn lại" — vì sao Job snapshot vẫn giữ node FG
  riêng (`itemType = FG`), không gộp vào node ROOT của `bom_items`.
- `docs/decisions/wip-removal.md` — nền tảng `BomType`/`bom_items` hiện tại (COMPONENT thay WIP).
