# Dựng cấu trúc item (item → BOM → công đoạn)

Không phải luồng chứng từ mà là **thứ tự dựng dữ liệu nền** — và thứ tự này bắt buộc, vì mỗi bước
tạo ra thứ bước sau cần khoá vào. Khái niệm BOM/routing ở `docs/domains/product-structure.md`.

## Trigger

Người dùng khai báo một item mới (FG, WIP, hoặc RM), hoặc tạo biến thể từ một FG/WIP đã có.

| Bước | Route |
| --- | --- |
| Tạo item | `POST /items` |
| Thêm node BOM (WIP hoặc RM) | `POST /items/:itemId/bom/items` |
| Công đoạn Cấp 0 | `POST /items/:itemId/operations` |
| Công đoạn của một node WIP | `POST /items/:itemId/bom/items/:bomItemId/operations` |
| Nhân bản (chỉ FG/WIP) | `POST /items/:itemId/copy` |

## Actor

`items:create` để tạo, **`items:bom-manage`** cho mọi thao tác ghi BOM lẫn routing (một quyền dùng
chung), `items:copy` để nhân bản.

Các route `GET` của mọi module trong nhóm này đều `@ApiAuth()` — đọc cấu trúc item cần đăng nhập
(khác trước, khi `GET /products` từng public — gộp vào `items` kéo theo dữ liệu vật tư (`supplierId`,
`minStock`, ...) trước đây phải đăng nhập mới xem được, nên siết luôn cả FG/WIP).

## Preconditions

- Tạo item: `unitId` phải đúng scope theo `type` — `PRODUCT` cho FG/WIP, `MATERIAL` cho RM (`E043`).
- Thêm node BOM: item gốc tồn tại và không phải RM (`E111`); node phải trỏ tới một WIP hoặc RM,
  không phải FG (`E053`); node cha (nếu có) phải cùng cây và không phải lá RM (`E052`); `quantity`
  phải nguyên dương nếu node là WIP, được phép lẻ nếu là RM (`E055`).
- Thêm công đoạn cho node: node phải thuộc đúng item trên URL (`E051`); node đó không được là RM
  (`E063`) — RM là lá, không có công đoạn as-used.
- Thêm công đoạn Cấp 0: item gốc không được là RM (`E111`).

## Flow

1. **Tạo item.** `POST /items` ghi `items`, cộng thêm `item_files` nếu gửi kèm `fileIds` (tài liệu
   đính kèm cấp item — khác bản vẽ node BOM, `docs/domains/product-structure.md`). **Không tạo BOM
   lẫn routing.**
2. **Thêm node BOM đầu tiên.** Header `boms` được tạo **lười** (get-or-create) ngay trong
   transaction ghi node đầu tiên. Đọc BOM của item chưa có node → mảng rỗng, không phải lỗi.
3. **Dựng cây.** Node không có `parentId` là con trực tiếp của item gốc ("Cấp 0" không phải một
   dòng). Một node trỏ WIP có thể có con (kể cả lá RM); một node trỏ RM luôn là lá.
4. **Gắn công đoạn — cùng khuôn as-used theo vị trí, khác đường ghi theo cấp:**
   - Công đoạn của **chính item gốc (Cấp 0)** → `POST /items/:itemId/operations`, ghi vào
     `routings`/`routing_operations` (header `routings` cũng sinh lười ở dòng đầu tiên, cùng
     pattern với `boms`).
   - Công đoạn của **một node WIP trong cây** → `POST .../bom/items/:bomItemId/operations`, ghi vào
     `bom_operations`, khoá theo `bomItemId`.

   Không có ràng buộc thứ tự đặc biệt cho vật tư nữa — RM chỉ là một node bình thường trong
   `POST .../bom/items`, không cần một bước khai riêng.
5. **Tạo biến thể (tuỳ chọn, chỉ FG/WIP).** `POST /items/:itemId/copy` (`E110` nếu RM) đọc trước
   toàn bộ cây `bom_items` lẫn `item_files` của item gốc rồi trong một transaction ghi item mới +
   clone cây (remap `parentId` sang id node mới) + clone danh sách `item_files`. `clonedFromItemId`
   ghi lại nguồn gốc nhưng **không tạo ràng buộc gì**. **Không** clone routing Cấp 0 (`routings`)
   hay công đoạn as-used (`bom_operations`) — chỉ cấu trúc cây và tài liệu đính kèm được nhân bản.

## State changes

**Không có.** `ItemStatus` (`ACTIVE`/`INACTIVE`) không phải cổng nghiệp vụ — chỉ màn tồn kho lọc
theo nó; BOM, đơn hàng và sản xuất đều nhận item `INACTIVE`.

## Side effects

- Node BOM đầu tiên kéo theo việc tạo header `boms`; công đoạn Cấp 0 đầu tiên kéo theo việc tạo
  header `routings` — hai bước ẩn duy nhất của workflow này.
- Xoá một node giữa cây **cascade sạch cả nhánh con (kể cả lá RM) và công đoạn as-used
  (`bom_operations`) của chúng**, không cảnh báo, không đếm trước.
- Nhân bản clone **cấu trúc cây + `item_files`**: các WIP/RM được tham chiếu giữ nguyên id, không
  được clone theo; routing Cấp 0 và công đoạn as-used cũng không theo. Bản sao và bản gốc trỏ chung
  các dòng `files` (bản vẽ node lẫn tài liệu cấp item), đúng ý nghĩa registry — chỉ dòng
  `item_files`/`bom_items.drawingFileId` là bản ghi riêng, `files` không nhân đôi.

## Transaction boundary

- Thêm/sửa/xoá node BOM: transaction bao get-or-create header `boms` + ghi node.
- Thêm công đoạn Cấp 0: transaction bao get-or-create header `routings` + ghi bước.
- Nhân bản: một transaction bao **toàn bộ** item + cây. Đây là lý do mọi phần đọc phải xong trước
  khi mở.
- Tạo/sửa item: transaction bao cấp mã (`document_sequences`, chỉ lúc tạo) + ghi `items` + replace-all
  `item_files` nếu request gửi `fileIds`.

## Failure cases

| Tình huống | Mã |
| --- | --- |
| Đơn vị tính sai scope | `E043` |
| Item gốc của BOM/routing là RM | `E111` |
| Node BOM trỏ tới FG | `E053` |
| Node cha là lá RM (không nhận con) | `E052` |
| SL node WIP không nguyên | `E055` |
| Node không thuộc item trên URL — công đoạn | `E051` |
| Gắn công đoạn vào node RM | `E063` |
| Nhân bản một item RM | `E110` |
| Dòng công đoạn (`PATCH`/`DELETE`) không tồn tại | `E056` (Cấp 0) / `E109` (theo node) |

Ngoài phạm vi kiểm: chu trình **xuyên cây** (BOM của A chứa B, BOM riêng của B chứa A) lọt hoàn
toàn; node anh em trùng nhau hợp lệ. Xem `docs/domains/product-structure.md`.

## Business rules

- Vì sao routing thuộc **vị trí** chứ không thuộc item, vì sao RM luôn là lá →
  `docs/domains/product-structure.md`.
- Vì sao versioning là clone chứ không phải bảng lịch sử phiên bản → cùng file.
- Vì sao đọc BOM không đệ quy xuống BOM của WIP con, và vì sao lá RM trên cây riêng của WIP con
  không tự cộng vào cây cha → cùng file.
- Item có hai loại file khác nhau — tài liệu đính kèm cấp item (`item_files`, replace-all) và bản vẽ
  kỹ thuật theo từng node BOM (`bom_items.drawingFileId`) — không thứ nào thay được thứ kia → cùng
  file.

## Related domains

`product-structure` là chủ; đọc `operations` (`docs/domains/partners.md`). Dữ liệu này chảy xuống
`orders` (mỗi dòng đơn một `itemId`, chỉ FG) và `production` — nhưng **sản xuất hiện chỉ lấy
`itemId` + số lượng, không đọc BOM và không đọc routing** ở tầng quyết định sản xuất (chỉ đọc lúc
duyệt LSX, xem `docs/domains/production.md`).

Code: `ItemsService.createItem`/`copyItem`, `BomsService` (cây, `boms.controller.ts`),
`BomOperationsService` (công đoạn as-used của node, module riêng import `BomsModule`),
`RoutingsService` (công đoạn Cấp 0, ghi qua `routings`/`routing_operations`).
