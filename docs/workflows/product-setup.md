# Dựng cấu trúc sản phẩm (sản phẩm → BOM → công đoạn)

Không phải luồng chứng từ mà là **thứ tự dựng dữ liệu nền** — và thứ tự này bắt buộc, vì mỗi bước
tạo ra thứ bước sau cần khoá vào. Khái niệm BOM/routing ở `docs/domains/product-structure.md`.

## Trigger

Người dùng khai báo một sản phẩm mới, hoặc tạo biến thể từ sản phẩm đã có.

| Bước | Route |
| --- | --- |
| Tạo sản phẩm | `POST /products` |
| Thêm node BOM | `POST /products/:productId/bom/items` |
| Vật tư của một node | `POST /products/:productId/bom/items/:itemId/materials` |
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
- Thêm node BOM: sản phẩm gốc tồn tại; node phải trỏ tới một WIP (`E053`); node cha (nếu có) phải
  cùng cây; `quantity` phải nguyên dương (chặn ở DTO, `422` chuẩn — không còn `ErrorCode` riêng).
- Thêm vật tư cho một node: vật tư tồn tại (`E035`); node đó phải thuộc đúng sản phẩm trên URL
  (`E051`) — cùng khuôn kiểm tra `RoutingService` dùng cho công đoạn (`E062`), khác mã vì khác
  resource.
- Thêm công đoạn cho node: node phải thuộc đúng sản phẩm trên URL (`E062`). Không còn ràng buộc
  "phải là node PRODUCT" — mọi node `bom_items` giờ luôn là PRODUCT.

## Flow

1. **Tạo sản phẩm.** `POST /products` chỉ ghi `products`. **Không tạo BOM.**
2. **Thêm node BOM đầu tiên.** Header `boms` được tạo **lười** (get-or-create) ngay trong
   transaction ghi node đầu tiên. Đọc BOM của sản phẩm chưa có node → mảng rỗng, không phải lỗi.
3. **Dựng cây.** Node không có `parentId` là con trực tiếp của sản phẩm gốc ("Cấp 0" không phải một
   dòng). `bom_items` giờ thuần cấu trúc WIP — không còn node vật tư.
4. **Gắn công đoạn (Cấp 0 hoặc node), khai vật tư (chỉ node) — cùng khuôn as-used cho routing, nhưng
   vật tư không còn Cấp 0:**
   - Công đoạn của **chính sản phẩm gốc (Cấp 0)** → khoá theo `productId` (`bomItemId` để trống).
   - Công đoạn/vật tư của **một vị trí trong cây** → khoá theo `bomItemId`.

   Vật tư luôn khoá theo `bomItemId`, nên **phải có node BOM trước mới khai được vật tư cho nó** —
   ràng buộc thứ tự thật sự của workflow này (routing không bị ràng buộc này ở Cấp 0, vì `productId`
   luôn có sẵn). Vật tư khai cho một node **không tự cộng thêm** vật tư trên cây BOM riêng của WIP mà
   node đó tham chiếu (nếu WIP đó có cây riêng) — hai danh sách độc lập.
5. **Tạo biến thể (tuỳ chọn).** `POST /products/:productId/copy` đọc trước toàn bộ (cây BOM theo
   thứ tự cha-trước-con, vật tư as-used, routing Cấp 0, routing từng node) rồi trong một
   transaction ghi sản phẩm mới + clone cây + clone vật tư (remap `bomItemId` sang id node mới) +
   remap routing sang id node mới. `sourceProductId` ghi lại nguồn gốc nhưng **không tạo ràng buộc
   gì**.

## State changes

**Không có.** `ProductStatus` (`ACTIVE`/`INACTIVE`) không phải cổng nghiệp vụ — chỉ màn tồn kho lọc
theo nó; BOM, đơn hàng và sản xuất đều nhận sản phẩm `INACTIVE`.

## Side effects

- Node BOM đầu tiên (hoặc công đoạn Cấp 0 đầu tiên) kéo theo việc tạo header `boms` — bước ẩn duy
  nhất của workflow này. Vật tư thì không thể là bước này — luôn cần một node có sẵn để gắn vào.
- Xoá một node giữa cây **cascade sạch cả nhánh con, routing as-used và vật tư as-used của chúng**,
  không cảnh báo, không đếm trước.
- Nhân bản chỉ clone **cấu trúc + vật tư as-used**: các WIP/vật tư được tham chiếu giữ nguyên id,
  không được clone theo. Bản sao và bản gốc trỏ chung các dòng `files`, đúng ý nghĩa registry.

## Transaction boundary

- Thêm/sửa/xoá node BOM: transaction bao get-or-create header + ghi node.
- Nhân bản: một transaction bao **toàn bộ** sản phẩm + cây + routing. Đây là lý do mọi phần đọc phải
  xong trước khi mở.
- Tạo sản phẩm: một `INSERT` đơn, không cần transaction.

## Failure cases

| Tình huống | Mã |
| --- | --- |
| Đơn vị tính sai scope | `E043` |
| Node trỏ tới FG thay vì WIP | `E053` |
| Số lượng WIP không nguyên | `422` (validate DTO, không còn `ErrorCode`) |
| Node không thuộc sản phẩm trên URL — vật tư | `E051` |
| Node không thuộc sản phẩm trên URL — công đoạn | `E062` |
| Vật tư không tồn tại | `E035` |
| Dòng vật tư (`PATCH`/`DELETE`) không tồn tại | `E108` |

Ngoài phạm vi kiểm: chu trình **xuyên cây** (BOM của A chứa B, BOM riêng của B chứa A) lọt hoàn
toàn; node anh em trùng nhau hợp lệ. Xem `docs/domains/product-structure.md`.

## Business rules

- Vì sao routing/vật tư thuộc **vị trí** chứ không thuộc sản phẩm → `docs/domains/product-structure.md`.
- Vì sao versioning là clone chứ không phải bảng lịch sử phiên bản → cùng file.
- Vì sao đọc BOM không đệ quy xuống BOM của WIP con, và vì sao vật tư trên cây riêng của WIP con
  không tự cộng vào cây cha → cùng file.
- Sản phẩm không có bảng đính kèm; bản vẽ kỹ thuật gắn theo từng node BOM → cùng file.

## Related domains

`product-structure` là chủ; đọc `materials` và `operations` (`docs/domains/partners.md`). Dữ liệu
này chảy xuống `orders` (mỗi dòng đơn một `productId`) và `production` — nhưng **sản xuất hiện chỉ
lấy `productId` + số lượng, không đọc BOM và không đọc routing**.

Code: `ProductsService.createProduct`/`copyProduct`, `BomsService` (cây, `boms.controller.ts`),
`BomMaterialsService` (vật tư as-used của node, `bom-materials.controller.ts` — module riêng, import
`BomsModule`), `RoutingService`.
