# Dựng cấu trúc item (item → BOM → công đoạn)

Không phải luồng chứng từ mà là **thứ tự dựng dữ liệu nền** — và thứ tự này bắt buộc, vì mỗi bước
tạo ra thứ bước sau cần khoá vào. Khái niệm BOM/routing ở `docs/domains/product-structure.md`.

## Trigger

Người dùng khai báo một item mới (FG hoặc CONSUMABLE), hoặc tạo biến thể từ một FG đã có. Thứ tự bắt buộc:
tạo item (`POST /items`) → thêm node BOM (`POST /items/:itemId/bom/items`, dòng `ROOT` tự sinh
ngay khi node đầu tiên được ghi, xem bước 2) → gắn công đoạn (Cấp 0 lẫn của một node `COMPONENT` đều
qua cùng route `POST /items/:itemId/bom/items/:bomItemId/operations`, chỉ khác `bomItemId` — Cấp 0
dùng id dòng `ROOT`) → nhân bản tuỳ chọn, chỉ FG (`POST /items/:itemId/copy`). Method/path đầy đủ:
Swagger `/api-docs`.

## Actor

`items:create` để tạo, **`items:bom-manage`** cho mọi thao tác ghi BOM lẫn routing (một quyền dùng
chung), `items:copy` để nhân bản.

Các route `GET` của mọi module trong nhóm này đều `@ApiAuth()` — đọc cấu trúc item cần đăng nhập
(khác trước, khi `GET /products` từng public — gộp vào `items` kéo theo dữ liệu vật tư (`supplierId`,
`minStock`, ...) trước đây phải đăng nhập mới xem được, nên siết luôn cả FG).

## Preconditions

- Tạo item: `unitId` phải đúng scope theo `type` — `PRODUCT` cho FG, `CONSUMABLE` cho CONSUMABLE (`E043`).
- Thêm node BOM: item gốc tồn tại và không phải CONSUMABLE (`E111`). Hai nhánh theo `type`
  (`ROOT` không tạo được qua route này — sinh tự động, xem bước 2):
  - `COMPONENT` (cấu trúc con) — bắt buộc `code`/`name`, không gửi `itemId`; sai shape → `E271`.
  - `CONSUMABLE` — bắt buộc `itemId` trỏ đúng item `type = CONSUMABLE` (không phải FG); sai → `E270`.
  Node cha (nếu có) phải cùng cây và không phải lá CONSUMABLE (`E052`); thêm `CONSUMABLE` thì node cha
  (kể cả `ROOT` khi không gửi `parentId`) chưa được có con `COMPONENT` (`E273`); `quantity` phải nguyên
  dương nếu node là `COMPONENT`, được phép lẻ nếu là `CONSUMABLE` (`E055`).
- Thêm công đoạn cho node: node phải thuộc đúng item trên URL (`E051`); node đó không được là `CONSUMABLE`
  (`E063`) — CONSUMABLE là lá, không có công đoạn as-used; `ROOT`/`COMPONENT` đều gắn được.
- Thêm công đoạn Cấp 0: item gốc không được là CONSUMABLE (`E111`).

## Flow

1. **Tạo item.** `POST /items` ghi `items`, cộng thêm `item_files` nếu gửi kèm `fileIds` (tài liệu
   đính kèm cấp item — khác bản vẽ node BOM, `docs/domains/product-structure.md`). **Không tạo BOM
   lẫn routing.**
2. **Thêm node BOM đầu tiên.** Header `boms` được tạo **lười** (get-or-create) ngay trong
   transaction ghi node đầu tiên, và **cùng lúc sinh luôn đúng 1 dòng `ROOT`** (`type = 'ROOT'`,
   `parentId = null`, `itemId` = chính item gốc) — một `boms` row không bao giờ tồn tại mà thiếu
   `ROOT`. Đọc BOM của item chưa có node → mảng rỗng, không phải lỗi (chưa có `boms` header nên
   cũng chưa có `ROOT`).
3. **Dựng cây.** `ROOT` là node duy nhất mang `parentId = null`; "không gửi `parentId`" khi tạo
   node nghĩa là "con trực tiếp của `ROOT`", được dịch thành `parentId = <id ROOT>` trước khi ghi
   — không còn dòng nào khác (ngoài chính `ROOT`) mang `parentId = null`. Một node `COMPONENT` (hoặc
   `ROOT`) có thể có con; một node `CONSUMABLE` luôn là lá. **Dựng cấu trúc trước, khai vật tư sau**:
   vật tư chỉ khai được ở node chưa có con `COMPONENT`, và thêm `COMPONENT` vào node đang có vật tư
   sẽ xoá ngầm số vật tư đó (lý do ở `docs/domains/product-structure.md`).
4. **Gắn công đoạn — cùng khuôn as-used, cùng một route cho mọi cấp:**
   `POST .../bom/items/:bomItemId/operations`, ghi vào `bom_operations`, khoá theo `bomItemId`.
   Công đoạn của **chính item gốc (Cấp 0)** dùng `bomItemId` = id dòng `ROOT`; công đoạn của
   **một node `COMPONENT` trong cây** dùng id của chính node đó — không còn hai đường ghi khác nhau.

   Không có ràng buộc thứ tự đặc biệt cho vật tư nữa — CONSUMABLE chỉ là một node bình thường trong
   `POST .../bom/items`, không cần một bước khai riêng.
5. **Tạo biến thể (tuỳ chọn, chỉ FG).** `POST /items/:itemId/copy` (`E110` nếu CONSUMABLE), body nhận
   `revision` bắt buộc — bản sao **giữ nguyên `code`** của bản gốc, chỉ khác `revision`
   (`E008` nếu cặp `code`+`revision` đã tồn tại). Đọc trước toàn bộ cây `bom_items` (gồm cả `ROOT`)
   lẫn `item_files` của item gốc rồi trong một transaction ghi item mới + clone cây (remap
   `parentId` sang id node mới; node `CONSUMABLE` giữ nguyên `itemId`, node `COMPONENT` copy nguyên
   `code`/`name`, node `ROOT` trỏ `itemId` sang item mới) + clone công đoạn as-used
   (`bom_operations`) của **mọi** node, kể cả `ROOT` — tức bản sao giờ **có luôn công đoạn Cấp 0**,
   không cần bước riêng nào — + clone danh sách `item_files`. `clonedFromItemId` ghi lại nguồn gốc
   nhưng **không tạo ràng buộc gì**.

## State changes

**Không có.** `ItemStatus` (`ACTIVE`/`INACTIVE`) không phải cổng nghiệp vụ — chỉ màn tồn kho lọc
theo nó; BOM, đơn hàng và sản xuất đều nhận item `INACTIVE`.

## Side effects

- Node BOM đầu tiên kéo theo việc tạo header `boms` **và** dòng `ROOT` — bước ẩn duy nhất của
  workflow này (không còn header `routings` riêng để sinh lười).
- Thêm node `COMPONENT` vào một node đang có lá CONSUMABLE **xoá ngầm toàn bộ CONSUMABLE cùng cha**
  trong cùng transaction, không cảnh báo.
- Xoá một node giữa cây **cascade sạch cả nhánh con (kể cả lá CONSUMABLE) và công đoạn as-used
  (`bom_operations`) của chúng**, không cảnh báo, không đếm trước. Dòng `ROOT` không xoá được qua
  route này (`E271` — xem Failure cases): sống/chết theo header `boms`.
- Nhân bản clone **cấu trúc cây (gồm `ROOT`) + công đoạn as-used (`bom_operations`) của mọi node +
  `item_files`**: các item CONSUMABLE được node lá tham chiếu giữ nguyên id, không được clone theo; node
  `COMPONENT`/`ROOT` là dữ liệu riêng của cây nên clone thật (bản sao mới, `ROOT` mới trỏ `itemId` sang
  item mới). Bản sao và bản gốc trỏ chung các dòng `files` (ảnh node COMPONENT lẫn tài liệu cấp
  item), đúng ý nghĩa registry — chỉ dòng `item_files`/`bom_items.imageFileId` là bản ghi riêng,
  `files` không nhân đôi.

## Transaction boundary

- Thêm/sửa/xoá node BOM: transaction bao get-or-create header `boms` (+ `ROOT` nếu là node đầu
  tiên) + ghi node.
- Thêm công đoạn (Cấp 0 lẫn theo node): transaction bao ghi bước `bom_operations`, không còn header
  nào khác cần get-or-create ở bước này (`boms`/`ROOT` đã tồn tại từ bước thêm node BOM).
- Nhân bản: một transaction bao **toàn bộ** item + cây + công đoạn as-used. Đây là lý do mọi phần
  đọc phải xong trước khi mở.
- Tạo/sửa item: transaction bao cấp mã (`document_sequences`, chỉ lúc tạo) + ghi `items` + replace-all
  `item_files` nếu request gửi `fileIds`.

## Failure cases

| Tình huống | Mã |
| --- | --- |
| Đơn vị tính sai scope | `E043` |
| Item gốc của BOM/routing là CONSUMABLE | `E111` |
| Node CONSUMABLE trỏ tới item không phải CONSUMABLE (kể cả FG) | `E270` |
| Node COMPONENT sai shape (thiếu `code`/`name`, hoặc kèm `itemId`) | `E271` |
| Node cha là lá CONSUMABLE (không nhận con) | `E052` |
| Thêm CONSUMABLE vào node đã có con COMPONENT | `E273` |
| SL node COMPONENT không nguyên | `E055` |
| Node không thuộc item trên URL — công đoạn | `E051` |
| Gắn công đoạn vào node CONSUMABLE | `E063` |
| Nhân bản một item CONSUMABLE | `E110` |
| Dòng công đoạn (`PATCH`/`DELETE`) không tồn tại | `E109` (mọi cấp, kể cả `ROOT`) |
| Sửa/xoá node `ROOT` qua API `bom-items` thường | `E271` |

Node anh em trùng nhau hợp lệ, trừ khi cả hai là CONSUMABLE cùng `itemId` (`E245`). Xem
`docs/domains/product-structure.md`.

## Business rules

- Vì sao routing thuộc **vị trí** chứ không thuộc item, vì sao CONSUMABLE luôn là lá, vì sao node COMPONENT
  không phải một item → `docs/domains/product-structure.md`.
- Vì sao versioning là clone chứ không phải bảng lịch sử phiên bản → cùng file.
- Vì sao chu trình BOM không còn cần kiểm (bất khả thi về cấu trúc từ khi bỏ WIP) →
  `docs/decisions/wip-removal.md`.
- Cấu trúc sản phẩm có ba loại file khác nhau — ảnh item (`items.imageFileId`), tài liệu đính kèm
  cấp item (`item_files`, replace-all) và ảnh riêng theo từng node BOM COMPONENT
  (`bom_items.imageFileId`) — không thứ nào thay được thứ kia → cùng file.

## Related domains

`product-structure` là chủ; đọc `operations` (`docs/domains/partners.md`). Dữ liệu này chảy xuống
`orders` (mỗi dòng đơn một `itemId` — không có ràng buộc nào ép phải là FG, xem
`docs/domains/product-structure.md`, Cross-domain dependencies) và `production` — nhưng **sản xuất
hiện chỉ lấy `itemId` + số lượng, không đọc BOM và không đọc routing** ở tầng quyết định sản xuất
(chỉ đọc lúc duyệt LSX, xem `docs/domains/production.md`).

Code: `ItemsService.createItem`/`copyItem`, `BomsService` (cây, gồm sinh `ROOT`,
`boms.controller.ts`), `BomOperationsService` (công đoạn as-used của mọi node — kể cả `ROOT`, một
module duy nhất, import `BomsModule`). Không còn `RoutingsService`/`routings`/`routing_operations`
— xem `docs/decisions/root-bom-item.md`.
