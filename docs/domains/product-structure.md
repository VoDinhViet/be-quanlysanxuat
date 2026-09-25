# Product Structure (Items — BOM — Công đoạn)

## Purpose

Mô tả một item được làm từ gì và đi qua những bước nào: danh mục hàng hoá (`items`), cây cấu trúc
(BOM) và chuỗi công đoạn (routing) — dữ liệu nền cho sản xuất, xem "Cross-domain" trước khi giả định
nó đã dùng để tính nhu cầu vật tư.

## Core concepts

**Chỉ còn 2 loại item: `FG` (thành phẩm) và `DIRECT` (vật tư)** — không còn `WIP` (bán thành phẩm),
xem `docs/decisions/wip-removal.md`. Cột riêng của DIRECT (`supplierId`, `minStock`, `directGrade`,
`technicalStandard`, ...) luôn NULL/mặc định với FG.

**Một node BOM có 2 hình dạng, phân biệt bởi `bom_items.type`**
(`docs/decisions/bom-header-as-level-0-anchor.md`):
- **`COMPONENT`** (cấu trúc con, thay cho WIP cũ) — `itemId = NULL`, mang `code`/`name` nhập **trực
  tiếp** vào chính dòng đó, riêng cho vị trí đó trong cây của sản phẩm này. KHÔNG phải một dòng
  `items`, KHÔNG hiện ở màn Sản phẩm/Vật tư, KHÔNG tái sử dụng được ở BOM khác. Vẫn lồng được nhiều
  cấp, vẫn gắn được công đoạn as-used qua `bom_operations`. Con của nó là **một trong hai, không lẫn**:
  hoặc toàn COMPONENT (node cấu trúc), hoặc toàn DIRECT (node lá — cấp cuối cùng của nhánh).
- **`DIRECT`** — `itemId NOT NULL`, trỏ `items.id` (`type = DIRECT`). Luôn là lá: không nhận con
  (`E052`), không gắn được `bom_operations` (`E063`).

**Cấp 0 (chính item FG gốc) không phải một dòng `bom_items` và không nằm trong response
`GET /items/:itemId/bom`** — đọc thông tin Cấp 0 qua `GET /items/:itemId`, công đoạn Cấp 0 qua
`GET /items/:itemId/operations` (bảng riêng `routing_operations`, neo `boms.id`, không qua node
nào — xem `docs/decisions/routing-operations-table.md`). `parentId = NULL` trên một node
`bom_items` nghĩa là "ngay dưới Cấp 0" (không còn nghĩa "chưa có cha" — Cấp 0 luôn là cha của nó).
Xem "Đừng hoàn lại" ở 2 quyết định trên trước khi định lưu lại Cấp 0 thành một dòng `bom_items`
hoặc gộp `routing_operations` vào `bom_operations`.

**Vật tư chỉ gắn vào node lá.** Node cha (Cấp 0/`COMPONENT`) đã có con COMPONENT là node cấu trúc,
không mang danh sách vật tư — thêm DIRECT vào đó bị chặn (`E273`). Chiều ngược lại, thêm
COMPONENT vào node đang có vật tư thì **toàn bộ DIRECT của node đó bị xoá ngầm** trong cùng
transaction (node vừa thành cha, vật tư phải khai lại ở cấp lá bên dưới). Lý do: nhu cầu vật tư là
Σ lá đã nổ cấp ("Chuẩn nổ cấp BOM") — vật tư khai ở cấp cha sẽ cộng song song với vật tư ở cấp lá
bên dưới, định mức sai.

CHECK `chk_bom_items_node_shape` ở tầng DB đảm bảo đúng 1 trong 2 hình dạng trên (không có node vừa
mang `itemId` vừa mang `code`/`name`, hay thiếu cả hai).

**DIRECT luôn là lá — không có BOM/routing riêng.** Chỉ DIRECT bị chặn khỏi làm cha
(`POST /items/:itemId/bom/items`, `E052`) và khỏi gắn công đoạn (`E063`). Dòng phiếu nhập/xuất
liên kết `orderItemId` chỉ nhận FG (service-enforced).

**Cấu trúc sản phẩm mang 3 loại file khác nhau:** ảnh đại diện của item (`items.imageFileId`, tối
đa 1, đọc ké vào node BOM DIRECT trỏ tới item đó) — tài liệu đính kèm cấp item (`item_files`,
nhiều file/item, replace-all qua `fileIds`) — ảnh riêng
**theo từng node BOM COMPONENT** (`bom_items.imageFileId`, tối đa 1, `UploadType.BOM_ITEM_IMAGE`;
node COMPONENT không trỏ `items` nên không có ảnh nào khác để đọc ké; DIRECT bị CHECK ép NULL).
Cột `image` trên node BOM là `coalesce(items.imageFileId, bom_items.imageFileId)`. Đổi/xoá ảnh
node **không** xoá file cũ khỏi registry (cùng cách `items`). Ba khái niệm không thay thế nhau.

**BOM là cây không có gốc lưu trữ.** Mỗi FG tối đa 1 `boms` header — gốc khái niệm của cây (Cấp 0),
không phải một dòng `bom_items` và không nằm trong cây đọc được. Mọi node `bom_items` lồng qua
`parentId`; `parentId = NULL` nghĩa là "ngay dưới Cấp 0"
(`docs/decisions/bom-header-as-level-0-anchor.md`). Khác trước kia (khi node có thể là WIP mang
định danh dùng chung, có BOM riêng ở nơi khác): node COMPONENT **không còn định danh dùng chung**,
nên không thể "vừa là node con vừa có cây riêng ở nơi khác" — mọi cấu trúc con đều nằm trọn trong
đúng 1 cây của đúng 1 sản phẩm. Chu trình BOM vì vậy **bất khả thi về cấu trúc**, không cần kiểm
tra ở service (`checkNoCycle`/`MAX_BOM_DEPTH` đã xoá).

**Routing "as-used" thuộc vị trí trong cấu trúc, không thuộc item.** Công đoạn Cấp 0 của chính item
FG gốc sống ở bảng riêng `routing_operations` (neo `boms.id`, route `items/:itemId/operations`),
tách khỏi `bom_operations` (as-used của node COMPONENT, `bomItemId NOT NULL`, `E063` nếu gắn vào
DIRECT) — `docs/decisions/routing-operations-table.md`. Cùng một part lắp ở vị trí này thì
hàn+2 ốc, vị trí khác thì sơn, không cần ốc.

**SL node phải nguyên nếu là `COMPONENT`, được phép lẻ nếu là `DIRECT`** (`ensureQuantityValid`, `E055`).

**ĐVT dùng chung, không thuộc riêng `items`.** `units` dùng được cho mọi loại item — không còn phân
scope theo `type`. Node `COMPONENT` không có ĐVT riêng (không phải item).

**`item_units` khai đơn vị phụ + hệ số quy đổi tham khảo ra đơn vị gốc (`items.unitId`) của riêng
item đó** — mount `/items/:itemId/units`. Dòng phiếu kho chỉ mặc định `unitId` hiển thị từ đây khi
payload không gửi — hệ số quy đổi thuần thông tin, không module nào đọc lại để tính toán
(`docs/decisions/unit-conversion.md`).

**Mã không còn là khoá duy nhất — cặp `(code, revision)` mới là.** `revision` là chuỗi tự do
(`items.revision`, mặc định `R01`).

**Versioning = clone cùng mã, revision khác** (`clonedFromItemId` chỉ ghi lineage, không ràng
buộc) — không phải lịch sử phiên bản có bảng riêng, vì sửa BOM/routing sau này không được đổi
ngược dữ liệu đã nằm trong đơn cũ. `POST /items/:id/copy` với FG giữ nguyên `code` của bản gốc, người
dùng nhập `revision` mới cho bản sao. Với DIRECT (mã do người dùng tự đặt, không có BOM) copy là
"tạo vật tư tương tự": người dùng nhập `code` mới (bắt buộc) và `name` (tuỳ chọn), `revision` giữ
`R01`; mọi cột còn lại (đơn vị, NCC, `minStock`, cột mở rộng, ảnh, tài liệu) copy nguyên.

## Entities

| Entity | Vai trò |
| --- | --- |
| `items` | FG/DIRECT; `clonedFromItemId` ghi lineage; full CRUD kể cả `DELETE` (soft, `E255` nếu đang dùng) |
| `item_files` | Nối `items`↔`files`, nhiều dòng/item, replace-all qua `fileIds` |
| `boms` | Header, 1 dòng/item (unique `itemId`), chỉ FG; là chính "Cấp 0" (không có node riêng, không đọc được qua `GET .../bom`) |
| `bom_items` | Node cây, tự lồng `parentId` (`NULL` = ngay dưới Cấp 0); `type = COMPONENT \| DIRECT`; `unitId`/`imageFileId` là ĐVT/ảnh riêng, chỉ node `COMPONENT` |
| `bom_operations` | Công đoạn as-used của node `COMPONENT` — `bomItemId NOT NULL` |
| `routing_operations` | Công đoạn as-used của Cấp 0 — `bomId NOT NULL`, bảng riêng, không qua `bom_items` |
| `operations` | Danh mục công đoạn gốc, full CRUD — `docs/domains/partners.md` |
| `units` | ĐVT dùng chung cho mọi loại item |
| `item_units` | Đơn vị phụ + hệ số quy đổi ra đơn vị gốc, riêng theo từng item |

## Lifecycle

`ItemStatus = ACTIVE | INACTIVE` — gần như không gác gì, chỉ màn tồn kho lọc theo. Node BOM/dòng đơn
hàng/sản xuất đều nhận item `INACTIVE`.

`boms` sinh lười (get-or-create trong transaction ghi dòng đầu tiên — node BOM đầu tiên hoặc công
đoạn Cấp 0 đầu tiên, cái nào ghi trước) — `POST /items` không tạo. Đọc cây của item chưa có `boms`
trả mảng rỗng, không phải lỗi.

`DELETE /items/:itemId` (soft, `items:delete`) — chặn `E255` nếu item còn được BOM/đơn hàng/LSX
tham chiếu.

## Business rules

- Thêm node `COMPONENT` — bắt buộc `code`/`name`, không có `itemId`; sai shape → `E271`. Thêm node `DIRECT`
  — bắt buộc `itemId` trỏ đúng item `type=DIRECT` (không phải FG) → sai thì `E270`; SL nguyên dương nếu
  `COMPONENT`, DIRECT dương được phép lẻ (`E055`).
- Node cha phải cùng BOM với con; cha là DIRECT thì không nhận con (`E052`); cha đã có con
  COMPONENT thì không nhận DIRECT (`E273`); thêm COMPONENT vào cha đang có DIRECT thì các
  DIRECT đó bị xoá cùng transaction, không cảnh báo (data migration `0187` đã dọn một lần các
  dòng lẫn có sẵn trước rule này). Cấp 0 không phải một dòng `bom_items` — không đọc/tạo/sửa/xoá
  được qua endpoint `bom-items` (`GET .../bom` không trả nó; `PATCH`/`DELETE` chỉ nhận `bomItemId`
  của một node thật).
- `bomItemId` trong route `bom-operations` phải là một node `bom_items` thật, thuộc đúng item trên
  URL (`E051`). Gắn `bom_operations` vào node DIRECT bị chặn (`E063`). Công đoạn Cấp 0 đi qua
  route riêng `items/:itemId/operations` (`routing_operations`, không có segment node).
- `operationId` trên một dòng `bom_operations` bất biến — đổi công đoạn = xoá bước rồi thêm lại.
- Một chuỗi công đoạn được lặp lại cùng công đoạn (không unique). Hai node anh em **cùng `itemId`**
  trên cùng node cha **bị chặn**, nhưng chỉ có ý nghĩa với node DIRECT — DB tách 2 partial
  index theo `parent_id IS NULL`/`IS NOT NULL` (`uq_bom_items_bom_item_no_parent`,
  `uq_bom_items_bom_parent_item` — Postgres coi NULL ≠ NULL qua `=` nên cần tách), cộng
  `ensureBomItemNotDuplicate` → `E245` ở service (chỉ chạy khi thêm node DIRECT).
- `POST /items/:itemId/copy` thiếu trường bắt buộc theo loại: FG thiếu `revision` → `E277`, DIRECT thiếu `code` → `E276`.
- `GET /items/export` xuất Excel cùng bộ lọc `GET /items`; `type` là mảng CSV (`?type=FG` hay
  `?type=DIRECT`) — cách duy nhất phân biệt xuất thành phẩm (FE trang Sản phẩm) hay vật tư (FE trang
  Vật tư), cả hai cùng gọi 1 endpoint. Không có cột giá — `items` không lưu giá. Trần 10.000 dòng,
  vượt trần cắt im lặng.

## Invariants

**DB đảm bảo:** 1 BOM/item; `quantity > 0`; cặp `(code, revision)` duy nhất giữa các dòng còn sống
(`uq_items_code_revision_active`); node `bom_items` đúng 1 trong 2 hình dạng
(`chk_bom_items_node_shape` — `type=DIRECT` thì `itemId` có/`code`+`name` không, `type=COMPONENT`
thì ngược lại); `bom_operations.bomItemId`/`routing_operations.bomId` đều `NOT NULL` — 2 bảng tách
riêng, không còn CHECK "đúng 1 trong 2 neo" trên cùng bảng; không có 2 node anh em cùng `itemId` khi
cả hai đều là DIRECT (2 partial index theo `parent_id IS NULL`/`IS NOT NULL`);
`production_job_bom_items.itemType` nhận
`FG`/`COMPONENT`/`DIRECT` (CHECK, enum riêng của bảng này) — kể cả `FG`, vì mỗi Job có 1 node
Cấp 0 `itemType='FG'` (`docs/decisions/oqc-per-operation.md`), khác cây BOM sống dùng
`COMPONENT`/`DIRECT` (tên khác nhau có chủ ý — 2 enum độc lập, xem
`docs/decisions/bom-header-as-level-0-anchor.md`).

**Chỉ service đảm bảo:** node DIRECT trỏ đúng item `type=DIRECT`; node DIRECT không nhận con/không gắn
`bom_operations`; node có con COMPONENT không mang DIRECT (`E273` + xoá ngầm khi thêm COMPONENT —
CHECK không nhìn được dòng anh em, không dùng trigger); SL nguyên nếu `COMPONENT`; cha cùng BOM; item
gốc BOM/routing không phải DIRECT; node anh em trùng `itemId` (`E245`, cùng DB constraint ở trên — 2 lớp).

**Không cần kiểm nữa (đã bất khả thi về cấu trúc):** chu trình BOM — trước kia phải kiểm vì một
node WIP mang định danh dùng chung, có thể vừa là con vừa có cây riêng ở nơi khác; node COMPONENT giờ
không có định danh dùng chung nên không thể tạo chu trình.

## Cross-domain dependencies

- **→ Production**: đọc đúng 1 lần lúc Job `start` (không phải lúc duyệt LSX —
  `docs/decisions/job-snapshot-at-start.md`) — toàn bộ cây `bom_items` (không có node Cấp 0 nào để
  lọc — Cấp 0 không phải một dòng `bom_items`) + `bom_operations` as-used, nhân bản sang
  `production_job_bom_items`/`production_job_operations` (id mới, `quantity` giữ nguyên thô). Vật
  tư Job (`production_job_issues`) là bản **đã nổ cấp** — xem "Chuẩn nổ cấp BOM". Công đoạn Cấp 0
  của FG (đọc từ `routing_operations.bomId`) snapshot **riêng** thành 1 node `itemType='FG'` của Job
  (`snapshotJobBomItems`) — không lẫn với node COMPONENT/DIRECT, giữ đúng quy ước Job cũ
  (`docs/decisions/oqc-per-operation.md`). Ngoài thời điểm đó, Production không tham chiếu lại
  `boms`/`bom_items` nữa — Job còn `PENDING` không có dòng snapshot nào, muốn xem cấu trúc/công
  đoạn sản phẩm thì đọc thẳng qua module này (`GET /items/:itemId/bom` + `.../operations`).
- **← Inventory**: `GET /inventory-products`/`GET /inventory-directs` chỉ thấy item `ACTIVE`.
- **← Orders**: dòng đơn tham chiếu `items.id` — **không có kiểm tra nào** ép phải là FG (không
  service-enforced, không DB CHECK; khác `inventory-issues.ensureItemsValid` có kiểm thật cho
  `orderItemId` trên dòng phiếu xuất). Cố ý không snapshot tên/ảnh, luôn đọc qua quan hệ.
- **→ Gia công ngoài**: node `COMPONENT` không có `items.id` nên không thể vào `inventory_balances` —
  đây là lý do cấu trúc thay cho quyết định cũ `docs/decisions/wip-not-stocked.md` (nay chỉ còn ý
  nghĩa lịch sử về mặt service, xem file đó).

## Vật tư ngoài cấu trúc (`bom_items.is_off_structure`)

Vật tư khai cho **sản phẩm chính (Cấp 0)** hoặc **một part `COMPONENT`** mà không thuộc cấu trúc
lắp ráp (sơn, que hàn, bao bì…). Vẫn là một node `DIRECT` trong `bom_items` (cùng route
`POST/PATCH/DELETE .../bom/items`, gửi `isOffStructure: true` khi tạo) nên nổ cấp, nhu cầu Job, copy
sản phẩm tự đúng. Khác node vật tư thường ở hai điểm: được gắn cạnh node `COMPONENT` (miễn `E273`), và
**không bị xoá ngầm** khi node cha có thêm con `COMPONENT`. Chỉ `DIRECT` mới có cờ này (CHECK
`chk_bom_items_off_structure_direct`). Chặn trùng `itemId` trong cùng một nơi gắn như node thường
(`E245`); cùng vật tư ở nhiều nơi gắn thì cộng dồn khi gộp theo `itemId`. `GET /items/:itemId/bom` trả
chúng với `isOffStructure = true`, đứng ngay sau node chủ (`parentId`, null = Cấp 0) và không chiếm số
thứ tự anh em — `path` của Part không bị ảnh hưởng, tab "Vật tư" của Part liệt kê cả vật tư thường lẫn vật tư ngoài cấu trúc.

## Chuẩn nổ cấp BOM: SL thô (per-parent) vs SL nổ cấp (exploded)

`bom_items.quantity` luôn là "SL cần cho 1 đơn vị của node **cha trực tiếp**" — dữ liệu gốc.
`GET /items/:itemId/bom` hiển thị thẳng giá trị này (UI đã có `level`/thụt lề để tự hiểu).

Field nào ngụ ý **tổng cho 1 đơn vị gốc** ("Định mức/1 bộ", "Nhu cầu vật tư") PHẢI là giá trị đã
**nổ cấp**: nhân luỹ kế `quantity` qua chuỗi node cha, seed=1 tại gốc (hoặc = SL Job), dừng ở node
DIRECT (lá). Cần một số duy nhất/vật tư thì gộp `SUM(...) GROUP BY itemId` sau khi nổ cấp. Hai nơi áp
dụng: `production_job_issues.requiredQty` (seed=SL Job) và `GET /items/:itemId/issues` (seed=1) —
`docs/decisions/bom-explosion-in-job-demand.md` giải thích vì sao đảo từ "không nổ cấp" sang nổ cấp.

`GET /items/:itemId/issues` (tab "Thành phần vật tư") là báo cáo phái sinh chỉ-đọc, 1 dòng/vật tư
(gộp), tách biệt cây `GET /items/:itemId/bom` — không có `sortOrder`/`note` (gắn 1 vị trí cụ thể).

## Common mistakes

1. `boms` chưa chắc tồn tại sau khi tạo item — luôn xử lý get-or-create. Không kéo theo node nào
   nữa (khác giai đoạn `root-bom-item.md`) — chỉ header.
2. Công đoạn as-used không phải thuộc tính của item — sống trên `bom_items.id` (node COMPONENT,
   bảng `bom_operations`) hoặc `boms.id` (Cấp 0, bảng riêng `routing_operations`) — 2 bảng tách
   biệt, xem `docs/decisions/routing-operations-table.md`.
3. Xoá một node giữa cây cascade sạch cả nhánh con + công đoạn as-used, không cảnh báo trước. Cấp 0
   không phải một dòng `bom_items` nên không xoá được qua endpoint này — không áp dụng.
4. Node anh em trùng `itemId` **bị chặn** khi cả hai là DIRECT (`E245` + unique index) — đã có từ
   đầu, không phải thiếu sót.
5. Ảnh item (`items.imageFileId`, DIRECT đọc qua `items`), tài liệu (`item_files`), ảnh riêng
   node COMPONENT (`bom_items.imageFileId`) là 3 khái niệm khác nhau, không thay thế nhau.
6. Clone không đệ quy — clone cấu trúc cây của chính cây đó (giữ nguyên `itemId` của node DIRECT tham
   chiếu, copy nguyên `code`/`name` của node COMPONENT **và** công đoạn as-used `bom_operations` của
   từng node) **cộng** clone `routing_operations` của Cấp 0 — 2 bước copy độc lập (khác bảng, không
   gộp 1 query như trước), kèm `item_files`; `unitId`/`imageFileId` của node COMPONENT copy nguyên
   (cùng file id).
7. Không có bảng `bom_materials` riêng — DIRECT là lá ngay trong `bom_items`.
8. Node `COMPONENT` không phải một item — không tìm nó ở `items`, không tái sử dụng được ở BOM khác,
   trùng `code`/`name` giữa 2 node COMPONENT ở 2 cây khác nhau là bình thường (không unique).
9. `GET /items/:itemId/bom` **không** trả Cấp 0 — chỉ node `COMPONENT`/`DIRECT` thật, node
   top-level mang `parentId = null`. Muốn thông tin Cấp 0 (mã/tên/ảnh/ĐVT) gọi `GET /items/:itemId`;
   muốn công đoạn Cấp 0 gọi `GET /items/:itemId/operations`.
10. Khai vật tư trực tiếp dưới Cấp 0 rồi mới thêm node COMPONENT → vật tư vừa khai biến mất (xoá
    ngầm, không phải bug); thêm vật tư vào node đã có con COMPONENT → `E273`. Dựng cấu trúc xong
    rồi mới khai vật tư ở từng lá.
11. `parentId` gửi lên `POST .../bom/items` phải là `id` của một node `bom_items` thật, hoặc
    omit/null (con trực tiếp của Cấp 0) — không có giá trị "anchor" nào khác để gửi.

## Related docs

- `docs/workflows/product-setup.md` — thứ tự dựng item → BOM → công đoạn → nhân bản.
- `docs/architecture.md` — vị trí cụm này trong sơ đồ ER tổng.
- `docs/decisions/wip-removal.md` — vì sao bỏ WIP, mô hình node COMPONENT/DIRECT.
- `docs/decisions/bom-header-as-level-0-anchor.md` — Cấp 0 neo qua `boms` header, không phải một
  dòng `bom_items`, không nằm trong response `GET .../bom`. `docs/decisions/routing-operations-table.md`
  — công đoạn Cấp 0 ở bảng riêng `routing_operations`. `docs/decisions/root-bom-item.md` (đã bị
  thay thế) — giai đoạn Cấp 0 từng là node `ROOT` thật.
- `docs/decisions/items-merge.md`, `docs/decisions/bom-explosion-in-job-demand.md`,
  `docs/decisions/unit-conversion.md`.
