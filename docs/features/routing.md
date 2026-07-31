# Tính năng: Routing (Công đoạn)

Bối cảnh nghiệp vụ, vòng đời và bất biến: `docs/domains/product-structure.md`. File này là chi tiết mức module: quy tắc cụ thể, ngữ nghĩa endpoint, error code.

## Mục đích

Chuỗi công đoạn mà một node trong cấu trúc sản phẩm phải đi qua — ví dụ Cắt laser → Chấn → Hàn → Sơn tĩnh điện. Một bảng duy nhất, `routing_steps`, phục vụ hai loại chủ thể; module `operations` là danh mục công đoạn gốc mà mỗi bước trỏ tới.

## Quy tắc nghiệp vụ

### Hai loại chủ thể, loại trừ nhau

Mỗi dòng `routing_steps` gắn với **đúng một** trong hai thứ, ràng buộc bằng DB CHECK `chk_routing_steps_target`:

| Loại | Cột được set | Nghĩa |
| ---- | ------------ | ----- |
| **Cấp 0** | `productId` (và `bomItemId = null`) | Routing của chính sản phẩm gốc — dòng FG/WIP, hiển thị là dòng "STT 0" của lưới cấu trúc |
| **As-used** | `bomItemId` (và `productId = null`) | Routing của **một node cụ thể** trong cây BOM |

- **Đây là điểm cốt lõi: routing as-used khoá theo *vị trí*, không theo *sản phẩm*.** Cùng một bán thành phẩm được dùng ở hai chỗ khác nhau trong cây có thể mang routing khác nhau ở mỗi chỗ, vì bước công đoạn gắn với *nơi nó được dùng* chứ không chỉ *nó là cái gì*. Sửa routing của node A **không** ảnh hưởng node B, kể cả khi cả hai trỏ tới cùng một WIP.
- **Chỉ node `itemType = PRODUCT` mới có routing.** Node MATERIAL (vật tư) không bao giờ mang routing → `E063` (400).
- **`bomItemId` bị scope theo sản phẩm trong URL.** Node thuộc cây BOM của sản phẩm khác không với tới được qua URL của sản phẩm này → `E062` (404). Cùng một mã lỗi cho cả hai ca "không tồn tại" và "thuộc cây khác" — cố ý, để không lộ sự tồn tại của node bên kia.
- **`stepId` cũng bị scope theo chủ thể.** Một step id thuộc routing khác không sửa/xoá được qua URL này → `E056` (404).

### Bước công đoạn

- `operationId` trỏ tới danh mục `operations`, và **bất biến** sau khi thêm. Đổi công đoạn của một bước = xoá rồi thêm lại — cùng quy ước với `bom_items`.
- Công đoạn phải tồn tại và chưa xoá mềm → `E046` (404). `operations` dùng xoá mềm, nên một công đoạn đã ngưng dùng vẫn giữ được các bước routing cũ đang trỏ tới nó (FK `onDelete: restrict` chặn xoá cứng).
- **Không có ràng buộc duy nhất trên `(chủ thể, operationId)`** — cố ý. Một quy trình thật hoàn toàn có thể đi qua cùng một công đoạn nhiều lần, ví dụ Kiểm tra → Gia công → Kiểm tra.
- `sortOrder` ("STT chạy") mặc định `0`. Sắp xếp theo `sortOrder` rồi `createdAt` để phá hoà. **Không tự động đánh lại số** — thêm nhiều bước mà không gửi `sortOrder` thì tất cả cùng bằng 0 và thứ tự rơi về theo thời gian tạo.
- `UpdateRoutingStepReqDto` chỉ có `sortOrder` và `note`.

### Vòng đời

- Xoá node BOM sẽ **xoá theo routing as-used của nó** (`routing_steps.bomItemId` có `onDelete: cascade`). Xoá sản phẩm bằng xoá mềm thì **không** đụng gì tới routing — các dòng vẫn còn.
- `POST /products/:id/copy` clone cả routing Cấp 0 lẫn routing as-used của từng node, ánh xạ `bomItemId` sang id node mới. Xem [`products.md`](products.md).
- Thêm một bước chỉ là **một câu lệnh insert**, mọi phép kiểm chạy trước — không cần transaction.

Module này từng có tên `revision-operations`/`product-operations` — đừng tìm các tên đó trong code, chỉ `routing` là hiện hành.

## API contract

Hai nhóm route đối xứng nhau, dùng chung service và chung `RoutingStepResDto`.

### Cấp 0 — routing của chính sản phẩm

Bảng route/DTO đầy đủ: Swagger UI ở `/api-docs` (tự sinh từ `@ApiAuth`/`@ApiPublic`, luôn khớp code). Dưới đây chỉ ghi ngữ nghĩa không đọc được từ signature.

### As-used — routing của một node BOM

> ⚠️ **Hai route GET đang thực sự public dù có `@Permissions('products:read')`** — `@ApiPublic()` áp `Public()`, và cả hai guard toàn cục đều bỏ qua route mang metadata đó. Xem ghi chú tương tự trong [`products.md`](products.md).

- **Route ghi dùng `products:bom-manage`** — dùng lại quyền của [`boms.md`](boms.md), không có quyền riêng cho routing.
- `GET` trả **mảng trần, không phân trang**, đã sắp theo thứ tự chạy.
- **Đọc routing as-used thường không cần gọi riêng**: `GET /products/:productId/bom` đã nhúng sẵn `operations` cho từng node PRODUCT. Endpoint riêng ở đây dành cho popup Công đoạn của một node, khi cần đọc lại sau lúc ghi.
- `RoutingStepResDto` là `{ id, sortOrder, note, operation, createdAt, updatedAt }`, trong đó `operation` là `{ id, code, name, type }` (`type` = `INHOUSE` / `OUTSOURCE`).
- **DTO không cho biết bước đó thuộc chủ thể nào** — điều đó nằm ngầm trong việc bạn gọi endpoint nào.
- Sau `POST`/`PATCH`, service đọc lại bước vừa ghi rồi mới map, nên `operation` luôn đầy đủ trong response.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| `productId` không tồn tại / đã xoá mềm | `ErrorCode.E007` | 404 |
| `operationId` không tồn tại / đã xoá mềm | `ErrorCode.E046` | 404 |
| Không tìm thấy bước, hoặc bước thuộc routing khác | `ErrorCode.E056` | 404 |
| `itemId` không tồn tại, hoặc thuộc cây BOM của sản phẩm khác | `ErrorCode.E062` | 404 |
| `itemId` trỏ tới node MATERIAL (vật tư không có routing) | `ErrorCode.E063` | 400 |
| Role của caller thiếu `products:bom-manage` | `ErrorCode.E033` | 403 |

Thứ tự kiểm: sản phẩm (`E007`) → node nếu là route as-used (`E062` → `E063`) → công đoạn khi `POST` (`E046`) → bước khi `PATCH`/`DELETE` (`E056`). Chỉ lỗi đầu tiên được trả về.

## Ngoài phạm vi

- Thời gian định mức, chi phí, hay máy/nhân công cho từng bước — bảng chỉ có công đoạn + thứ tự + ghi chú.
- Routing rẽ nhánh hoặc song song — mô hình hiện tại là chuỗi tuyến tính.
- Ràng buộc bước trước/bước sau ngoài `sortOrder`.
- Tiến độ sản xuất thực tế (bước nào đã chạy xong) — đây là dữ liệu định nghĩa, không phải dữ liệu thực thi.
- Routing mặc định theo sản phẩm rồi kế thừa xuống các node dùng nó — mỗi vị trí tự khai routing của mình.

## Xem thêm

- [`boms.md`](boms.md) — cây cấu trúc, nơi `operations` được nhúng sẵn theo node.
- [`products.md`](products.md) — bảng gốc, và cách nhân bản clone luôn routing.
- [`master-data.md`](master-data.md) — `operations`, danh mục công đoạn gốc (`INHOUSE`/`OUTSOURCE`).
- `docs/architecture.md` — sơ đồ ER và thứ tự ghi của cả miền.
