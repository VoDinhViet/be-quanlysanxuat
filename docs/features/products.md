# Tính năng: Products (Sản phẩm)

## Mục đích

Quản lý sản phẩm — cả **thành phẩm** (`FINISHED_GOOD`) lẫn **bán thành phẩm** (`WORK_IN_PROGRESS`). Đây là bảng gốc mà toàn bộ miền cấu trúc sản phẩm dựng lên trên: BOM ([`boms.md`](boms.md)) và công đoạn ([`routing.md`](routing.md)) đều móc vào một dòng `products`.

## Quy tắc nghiệp vụ

### Phân loại và trạng thái

- **Thành phẩm và bán thành phẩm nằm chung một bảng.** Chúng dùng chung mọi cơ chế (hình ảnh, BOM, routing) và chỉ khác nhau ở cách được dùng: `FINISHED_GOOD` là gốc của cây cấu trúc của chính nó, `WORK_IN_PROGRESS` được tham chiếu như một node con trong cây BOM của sản phẩm khác. **Vật tư (RM) là bảng hoàn toàn khác** — xem `materials`.
- `type` mặc định `FINISHED_GOOD` khi không gửi. Hai giá trị này **đổi tên từ `FG`/`WIP` vào 2026-07-22**; không còn client nào nên gửi tên cũ.
- `status` mặc định `ACTIVE`, giá trị còn lại là `INACTIVE`. Đây chỉ là cờ hiển thị/lọc — hệ thống **không** chặn dùng sản phẩm `INACTIVE` trong BOM hay đơn hàng.

### Mã sản phẩm

- **`code` tự sinh khi không gửi**, theo dạng `SP0001` — đếm tổng số dòng `products` rồi +1, pad 4 chữ số.
- Cách sinh này **đếm cả sản phẩm đã xoá mềm**, nên mã không liền mạch sau khi xoá là bình thường, không phải bug.
- **Có cửa sổ TOCTOU**: hai request tạo song song có thể tính ra cùng một số. Chốt chặn thật là ràng buộc `unique` trên cột `products.code` ở DB — request thua cuộc sẽ nhận lỗi từ tầng DB, không phải `E008`.
- Gửi `code` thủ công thì nó được kiểm trùng trước (`E008`, 409). Khi `PATCH`, phép kiểm loại trừ chính dòng đang sửa (`ne(products.id, id)`), nên `PATCH` lại đúng mã cũ không bị coi là trùng.

### Đơn vị tính, khách hàng, nhóm

- **`unitId` bắt buộc, và đơn vị phải dùng được cho sản phẩm.** Không chỉ kiểm tồn tại (`E011`, 404) mà còn kiểm đơn vị đó có scope `PRODUCT` (`E043`, 400). Hai lỗi cố ý tách nhau: client cần phân biệt "không tìm thấy đơn vị" với "đơn vị này không dùng được cho sản phẩm". Lọc dropdown bằng `GET /units?scope=PRODUCT` chỉ là hiển thị — request viết tay vẫn bị chặn ở đây.
- `clientId` và `productGroupId` **tuỳ chọn** và nullable; nếu có gửi thì phải tồn tại (`E009` / `E010`, đều 404).

### Hình ảnh và tài liệu đính kèm

- `imageFileId` và `attachmentFileIds` đều trỏ tới registry `files`, **không bao giờ là URL trần**. Upload trước qua `POST /files?type=PRODUCT_IMAGE` / `PRODUCT_DOCUMENT`, rồi gửi id lên đây.
- Mọi file id gửi lên được kiểm và **đánh dấu đã liên kết** (`FilesService.linkFiles`) **trước khi transaction mở**, để bộ quét file mồ côi không dọn mất chúng.
- **`attachmentFileIds` là replace-all khi `PATCH`**, và phân biệt hai trạng thái khác nhau:
  - gửi `[]` → **xoá hết** tài liệu đính kèm;
  - **bỏ hẳn trường** → PATCH này không đụng tới tài liệu.
  Đây là lý do code kiểm truthy trên chính mảng chứ không phải `.length`.
- Trong response, các file được đổi tên: quan hệ `imageFile` phơi ra thành `image`. `FileResDto.url` là **link ký số có hạn** — dùng trực tiếp làm `<img src>` được, nhưng **đừng cache hay lưu lại**: hết `UPLOAD_URL_TTL` giây là hỏng, phải đọc lại sản phẩm để lấy link mới.

### Xoá

- **Xoá là xoá mềm** (`deletedAt`). Mọi truy vấn đọc đều lọc `isNull(products.deletedAt)`.
- **Không có kiểm ràng buộc trước khi xoá.** Xoá mềm một sản phẩm đang được dùng làm node trong BOM của sản phẩm khác vẫn thành công — dòng `bom_items` còn nguyên (`onDelete: restrict` chỉ chặn xoá cứng), nhưng cây BOM sẽ đọc ra node trỏ tới một sản phẩm đã ẩn. Cần chặn thì phải bổ sung luật, hiện chưa có.

### Nhân bản sản phẩm (`POST /products/:id/copy`)

- **Đây là cơ chế "phiên bản" của dự án này.** Module `product-revisions` đã bị gỡ vào 2026-07-24; không có bảng `product_revisions` hay cột `currentRevisionId` nữa. Muốn một biến thể mới thì clone cả sản phẩm.
- Clone sâu, trong **một transaction**: dòng sản phẩm, tài liệu đính kèm, **toàn bộ cây BOM**, routing Cấp 0, và routing as-used của từng node đã clone.
- **Bản sao là một sản phẩm độc lập hoàn toàn** — BOM riêng, routing riêng. `sourceProductId` chỉ ghi lại nguồn gốc để hiển thị ("Sao chép từ"), không tạo ràng buộc gì sau đó; sửa bản sao không ảnh hưởng bản gốc và ngược lại.
- **Bản sao trỏ tới cùng các dòng `files` với bản gốc** — `files` là registry, hai sản phẩm cùng tham chiếu một file chính là công dụng của nó. File không bị nhân đôi trên đĩa.
- **Clone BOM không clone đệ quy các sản phẩm được tham chiếu.** `productId`/`materialId` trên mỗi node vẫn trỏ tới đúng WIP/vật tư gốc — chỉ cấu trúc được nhân bản, không phải các sản phẩm thành phần.
- Đường dẫn `path` (ltree) của từng node được **dựng lại từ id mới**, không copy nguyên: `path` cũ nhúng id cũ nên copy thẳng sẽ hỏng.
- `code` của bản sao **luôn tự sinh**, không nhận từ client. `name` giữ nguyên tên bản gốc — hai sản phẩm cùng tên khác mã là trạng thái bình thường sau khi nhân bản, client nên hiển thị mã để phân biệt.
- Người tạo bản sao là caller hiện tại (`createdBy`), không phải người tạo bản gốc.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products` | **public** ⚠️ | `GetProductsReqDto` — `limit`, `page`, `q`, `order`, `clientId`, `productGroupId`, `type`, `status` | `200` + `ProductResDto` phân trang |
| GET | `/products/:productId` | **public** ⚠️ | — | `200` + `ProductResDto` |
| POST | `/products` | `products:create` | `CreateProductReqDto` — `name`*, `unitId`*, `code`, `type`, `clientId`, `productGroupId`, `imageFileId`, `attachmentFileIds`, `status`, `note` | `201` + `ProductResDto` |
| PATCH | `/products/:productId` | `products:update` | `UpdateProductReqDto` — mọi trường tuỳ chọn | `200` + `ProductResDto` |
| DELETE | `/products/:productId` | `products:delete` | — | `204`, không có body |
| POST | `/products/:productId/copy` | `products:copy` | — | `201` + `ProductResDto` (bản sao) |

(`*` = bắt buộc)

> ⚠️ **Hai route GET đang thực sự public, dù có `@Permissions('products:read')`.** Chúng dùng `@ApiPublic()`, mà decorator này áp `Public()`; cả `JwtAuthGuard` lẫn `PermissionsGuard` đều `return true` ngay khi thấy metadata đó. Nên `@Permissions` trên hai route này **không có tác dụng** — gọi được mà không cần token. Tài liệu ghi đúng hành vi hiện tại; nếu ý định thật là bắt buộc đăng nhập thì phải đổi `@ApiPublic` thành `@ApiAuth` (là thay đổi breaking với client đang gọi không token). Các route GET của [`boms.md`](boms.md) và [`routing.md`](routing.md) cũng đang y hệt.

- `q` khớp mờ (`unaccent` ILIKE) `code`, `name` **và tên nhóm sản phẩm** (qua subquery vào `product_groups`) — rộng hơn các endpoint danh sách khác, vốn chỉ tìm `code`/`name`.
- Bốn filter `clientId` / `productGroupId` / `type` / `status` cộng dồn theo `AND`, và cộng dồn với `q`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- **`ProductResDto` ở danh sách nhẹ hơn ở chi tiết**: bản danh sách không kèm `attachments` (chi tiết thì có). Các quan hệ khác — `client`, `group`, `unit`, `creator`, `image`, `source` — có ở cả hai. Đừng dựng màn hình chi tiết từ dữ liệu lấy ở danh sách.
- `client`/`group`/`unit`/`source` là ref gọn `{ id, code, name }`; `creator` là `{ id, username }`.
- Sau `POST`/`PATCH`/`copy`, service đọc lại dòng bằng `getProductDetail(id)` rồi mới map — response luôn là trạng thái đã lưu, kèm đầy đủ quan hệ.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Không tìm thấy sản phẩm (hoặc đã xoá mềm) | `ErrorCode.E007` | 404 |
| `code` đã tồn tại ở sản phẩm khác | `ErrorCode.E008` | 409 |
| `clientId` không tồn tại | `ErrorCode.E009` | 404 |
| `productGroupId` không tồn tại | `ErrorCode.E010` | 404 |
| `unitId` không tồn tại | `ErrorCode.E011` | 404 |
| Đơn vị tồn tại nhưng không có scope `PRODUCT` | `ErrorCode.E043` | 400 |
| `imageFileId`/`attachmentFileIds` chứa file id không tồn tại | `ErrorCode.E042` | 404 |
| Role của caller thiếu quyền route yêu cầu | `ErrorCode.E033` | 403 |

`E006` (`product.error.locked`) có trong enum nhưng **hiện không có chỗ nào throw** — đừng xử lý nó ở client cho tới khi có luật khoá sản phẩm thật.

## Ghi chú tích hợp cho frontend

- **Breaking (2026-07-24)**: module `product-revisions` đã bị gỡ. Mọi route `/products/:id/revisions*` không còn tồn tại, `ProductResDto` không còn `currentRevisionId`. Thay bằng `POST /products/:id/copy` — trả về một sản phẩm mới hoàn chỉnh, không phải một revision. `E048`/`E049` được giữ chỗ nhưng không còn được throw.
- **Breaking (2026-07-24)**: BOM và routing đổi từ khoá theo revision sang khoá theo product. Đường dẫn mới là `/products/:productId/bom` và `/products/:productId/operations` — xem [`boms.md`](boms.md), [`routing.md`](routing.md).
- **Mới (2026-07-24)**: `ProductResDto.source` (`{ id, code, name }` hoặc `null`) cho biết sản phẩm này được sao chép từ đâu. Hiển thị nhãn "Sao chép từ <code>" khi khác `null`; đừng suy ra bất kỳ liên kết dữ liệu nào từ nó, đây thuần tuý là thông tin nguồn gốc.
- **(2026-07-22)**: `type` đổi giá trị từ `FG`/`WIP` sang `FINISHED_GOOD`/`WORK_IN_PROGRESS`. Filter `?type=` phải dùng tên mới.
- Khi `PATCH` mà **không** muốn đụng tới tài liệu đính kèm, hãy **bỏ hẳn `attachmentFileIds`** khỏi body. Gửi `[]` là lệnh xoá sạch.

## Ngoài phạm vi

- Giá, tồn kho, đơn vị quy đổi.
- Khoá sản phẩm khi đã có phát sinh (`E006` giữ chỗ cho việc này).
- Chặn xoá sản phẩm đang được dùng trong BOM của sản phẩm khác.
- Lịch sử thay đổi / audit log — chỉ có `createdBy` + timestamp.

## Xem thêm

- [`boms.md`](boms.md) — cấu trúc sản phẩm, một BOM cho mỗi sản phẩm.
- [`routing.md`](routing.md) — công đoạn, cả Cấp 0 lẫn as-used theo node.
- `docs/architecture.md` — sơ đồ ER và luồng ghi của cả miền products/boms/routing.
