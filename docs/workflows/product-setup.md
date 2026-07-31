# Dựng cấu trúc sản phẩm (sản phẩm → BOM → công đoạn)

Không phải luồng chứng từ mà là **thứ tự dựng dữ liệu nền** — và thứ tự này bắt buộc, vì mỗi bước
tạo ra thứ bước sau cần khoá vào. Khái niệm BOM/routing ở `docs/domains/product-structure.md`.

## Trigger

Người dùng khai báo một sản phẩm mới, hoặc tạo biến thể từ sản phẩm đã có.

| Bước | Route |
| --- | --- |
| Tạo sản phẩm | `POST /products` |
| Thêm node BOM | `POST /products/:productId/bom/items` |
| Công đoạn Cấp 0 | `POST /products/:productId/operations` |
| Công đoạn của một node | `POST /products/:productId/bom/items/:itemId/operations` |
| Nhân bản | `POST /products/:productId/copy` |

## Actor

`products:create` để tạo, **`products:bom-manage`** cho mọi thao tác ghi BOM lẫn routing (một
quyền dùng chung), `products:copy` để nhân bản.

⚠️ Role `PRODUCTION` trong seed có `products:create/update/delete/copy` nhưng **không có
`products:bom-manage`** — đúng người dựng sản phẩm lại không dựng được BOM. Xem
`docs/domains/identity-access.md`.

Các route `GET` của cả ba module đều `@ApiPublic()` — **đọc cấu trúc sản phẩm không cần đăng nhập**.

## Preconditions

- Tạo sản phẩm: `unitId` phải là đơn vị có scope `PRODUCT` (`E043`).
- Thêm node BOM: sản phẩm gốc tồn tại; node `PRODUCT` phải trỏ tới một WIP (`E053`); node cha (nếu
  có) phải cùng cây.
- Thêm công đoạn cho node: node phải thuộc đúng sản phẩm trên URL (`E062`) và phải là node
  `PRODUCT` (`E063`) — vật tư không có công đoạn.

## Flow

1. **Tạo sản phẩm.** `POST /products` chỉ ghi `products` + `product_attachments`. **Không tạo BOM.**
2. **Thêm node BOM đầu tiên.** Header `boms` được tạo **lười** (get-or-create) ngay trong
   transaction ghi node đầu tiên. Đọc BOM của sản phẩm chưa có node → mảng rỗng, không phải lỗi.
3. **Dựng cây.** Node không có `parentId` là con trực tiếp của sản phẩm gốc ("Cấp 0" không phải một
   dòng). Node `MATERIAL` luôn là lá.
4. **Gắn công đoạn.** Hai đích khác nhau, không thay thế nhau được:
   - Công đoạn của **chính sản phẩm gốc** → khoá theo `productId`.
   - Công đoạn của **một vị trí trong cây** → khoá theo `bomItemId`.

   Vì routing khoá theo `bomItemId`, **phải có node BOM trước mới gắn được công đoạn cho nó** — đây
   là ràng buộc thứ tự thật sự của workflow này.
5. **Tạo biến thể (tuỳ chọn).** `POST /products/:productId/copy` đọc trước toàn bộ (đính kèm, cây
   BOM theo thứ tự cha-trước-con, routing Cấp 0, routing từng node) rồi trong một transaction ghi
   sản phẩm mới + clone cây + remap routing sang id node mới. `sourceProductId` ghi lại nguồn gốc
   nhưng **không tạo ràng buộc gì**.

## State changes

**Không có.** `ProductStatus` (`ACTIVE`/`INACTIVE`) không phải cổng nghiệp vụ — chỉ màn tồn kho lọc
theo nó; BOM, đơn hàng và sản xuất đều nhận sản phẩm `INACTIVE`.

## Side effects

- Node BOM đầu tiên kéo theo việc tạo header `boms` — bước ẩn duy nhất của workflow này.
- Xoá một node giữa cây **cascade sạch cả nhánh con và routing as-used của chúng**, không cảnh báo,
  không đếm trước.
- Nhân bản chỉ clone **cấu trúc**: các WIP/vật tư được tham chiếu giữ nguyên id, không được clone
  theo. Bản sao và bản gốc trỏ chung các dòng `files`, đúng ý nghĩa registry.

## Transaction boundary

- Thêm/sửa/xoá node BOM: transaction bao get-or-create header + ghi node.
- Nhân bản: một transaction bao **toàn bộ** sản phẩm + đính kèm + cây + routing. Đây là lý do mọi
  phần đọc phải xong trước khi mở.
- Tạo sản phẩm: transaction bao dòng `products` + đính kèm.

## Failure cases

| Tình huống | Mã |
| --- | --- |
| Đơn vị tính sai scope | `E043` |
| Node `PRODUCT` trỏ tới FG thay vì WIP | `E053` |
| Số lượng WIP không nguyên | `E055` |
| Node không thuộc sản phẩm trên URL | `E062` |
| Gắn công đoạn vào node `MATERIAL` | `E063` |

Ngoài phạm vi kiểm: chu trình **xuyên cây** (BOM của A chứa B, BOM riêng của B chứa A) lọt hoàn
toàn; node anh em trùng nhau hợp lệ. Xem `docs/domains/product-structure.md`.

## Business rules

- Vì sao routing thuộc **vị trí** chứ không thuộc sản phẩm → `docs/domains/product-structure.md`.
- Vì sao versioning là clone chứ không phải bảng lịch sử phiên bản → cùng file.
- Vì sao đọc BOM không đệ quy xuống BOM của WIP con → cùng file.

⚠️ Bug đang tồn tại: clone **không sao chép `drawingFileId`** của node, nên nhân bản âm thầm làm mất
bản vẽ kỹ thuật. Chi tiết ở `docs/domains/product-structure.md`.

## Related domains

`product-structure` là chủ; đọc `materials` và `operations` (`docs/domains/partners.md`). Dữ liệu
này chảy xuống `orders` (mỗi dòng đơn một `productId`) và `production` — nhưng **sản xuất hiện chỉ
lấy `productId` + số lượng, không đọc BOM và không đọc routing**.

Code: `ProductsService.createProduct`/`copyProduct`, `BomsService`, `RoutingService`.
