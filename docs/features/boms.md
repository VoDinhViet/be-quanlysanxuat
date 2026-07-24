# Tính năng: BOMs (Cấu trúc sản phẩm)

## Mục đích

Cây cấu trúc của một sản phẩm — sản phẩm đó gồm những cụm/chi tiết (bán thành phẩm) và vật tư nào, mỗi thứ bao nhiêu. Hai bảng: `boms` (header, mỗi sản phẩm một dòng) và `bom_items` (các node, tự tham chiếu).

Cây được đọc nguyên khối, nhưng **ghi theo từng node theo thời gian thực** — mỗi lần bấm `[+]` / sửa SL / bấm `[X]` là một request, không có nút "Lưu" gom cả cây.

## Quy tắc nghiệp vụ

### Hình dạng cây

- **Mỗi sản phẩm có tối đa một BOM.** `boms.productId` là `unique`.
- **BOM được tạo lười (lazy).** Sản phẩm mới chưa có dòng `boms` nào; nó chỉ được tạo khi node đầu tiên được thêm. Vì vậy `GET .../bom` trả về `[]` — **không phải 404** — khi sản phẩm chưa có cấu trúc. Đây là trạng thái bình thường.
- **Node gốc "Cấp 0" KHÔNG được lưu trong `bom_items`.** Bản thân sản phẩm chính là gốc. Node có `parentId = null` là con trực tiếp của gốc, tức "Cấp 1".
- `level` trong response là **độ sâu 1-based tính động** lúc dựng cây, không phải cột `level` trong DB. Con trực tiếp của gốc = 1.
- Anh em cùng cha sắp theo `sortOrder` rồi tới `createdAt`. Số "STT" kiểu `1.0.3` trên giao diện là thứ suy ra từ vị trí trong cây, không lưu ở đâu cả.
- `path` là cột ltree phục vụ truy vấn cây, không phơi ra API.

### Node trỏ tới cái gì

- Mỗi node là **PRODUCT** (cụm/chi tiết) hoặc **MATERIAL** (vật tư), quyết định bởi `itemType`; đúng một trong `productId`/`materialId` được set, có DB CHECK bảo đảm.
- Request chỉ gửi `itemType` + một `itemId` duy nhất, thay vì hai trường `productId`/`materialId` riêng. Cách này **tự nó loại trừ được trường hợp gửi cả hai hoặc không gửi gì** — popup chọn Mã cũng chỉ chọn được một thứ.
- **Node PRODUCT bắt buộc trỏ tới sản phẩm `type = WORK_IN_PROGRESS`** → nếu là `FINISHED_GOOD` thì `E053` (400). Thành phẩm là gốc của cây của chính nó, không thể làm con của ai.
- **Node MATERIAL là lá, vĩnh viễn.** Đặt nó làm `parentId` của node khác → `E052` (400).
- `materials` không có xoá mềm, nên kiểm tồn tại vật tư chỉ là tra id (`E035` nếu không có).

### Số lượng

- `quantity` là `numeric(12,3)`, **bắt buộc > 0** (DB CHECK) và bắt buộc dương ở tầng DTO.
- **Node WIP phải có SL là số nguyên** → không nguyên thì `E055` (400). Node vật tư được phép thập phân (0.5 mét tôn là hợp lệ).
- Khi `PATCH`, phép kiểm số nguyên **chỉ chạy nếu `quantity` thực sự được gửi lên** — sửa mỗi `note` của một node WIP không bị nó chặn.

### Chống chu trình

- Một sản phẩm không được trở thành tổ tiên/hậu duệ của chính nó. Hai phép kiểm, cả hai đều trả `E054` (409):
  - node mới không được chính là sản phẩm gốc của cây;
  - đi ngược từ `parentId` lên gốc, `productId` của node mới không được đã xuất hiện ở nhánh tổ tiên.
- Chỉ áp dụng cho node PRODUCT — node MATERIAL là lá, không bao giờ làm tổ tiên được.
- Vòng lặp bị chặn bởi `MAX_BOM_DEPTH = 50` như một lưới an toàn chống lặp vô hạn khi dữ liệu hỏng; chạm ngưỡng cũng trả `E054`. Chưa dùng `WITH RECURSIVE` vì repo chưa có tiền lệ và cây thực tế nông.
- **Chống chu trình chỉ xét trong cùng một cây.** Nó không phát hiện vòng gián tiếp qua BOM của sản phẩm khác (A chứa B, mà BOM của B lại chứa A) — mỗi cây được kiểm độc lập.

### Sửa và xoá

- **`itemType`, `itemId`, `parentId` đều bất biến.** `UpdateBomItemReqDto` chỉ có `quantity`, `sortOrder`, `note`. Muốn đổi node trỏ vào đâu, hay chuyển nó sang cha khác, thì xoá rồi thêm lại — chưa có thao tác move/re-parent.
- **Xoá một node là xoá luôn cả nhánh con của nó.** `bom_items.parentId` có `onDelete: cascade`, nên xoá node giữa cây kéo theo toàn bộ hậu duệ, không có cảnh báo và không đếm trước số node sẽ mất. Giao diện nên hỏi xác nhận.
- Xoá node cũng xoá routing as-used gắn với nó (`routing_steps.bomItemId` cascade).
- Node bị scope theo BOM của sản phẩm trong URL: `itemId` thuộc cây của sản phẩm khác sẽ trả `E050` (404), không sửa/xoá xuyên sản phẩm được.

### Công đoạn nhúng kèm

- Khi đọc cây, **mỗi node PRODUCT kèm sẵn routing as-used của chính nó** ở trường `operations`, lấy bằng một truy vấn gộp cho cả cây (không phải N+1). **Node MATERIAL luôn là `[]`.**
- Đây là routing khoá theo `bom_items.id`, **không phải** theo sản phẩm mà node đó trỏ tới — cùng một WIP nằm ở hai vị trí khác nhau có thể có routing khác nhau. Chi tiết ở [`routing.md`](routing.md).
- Response ghi/sửa một node (`BomItemNodeResDto`) **không có** `operations` và `children` — hai trường đó chỉ có khi đọc cả cây (`BomItemResDto`).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products/:productId/bom` | **public** ⚠️ | — | `200` + `BomItemResDto[]` (cây lồng nhau) |
| POST | `/products/:productId/bom/items` | `products:bom-manage` | `CreateBomItemReqDto` — `itemType`*, `itemId`*, `quantity`*, `parentId`, `sortOrder`, `note` | `201` + `BomItemNodeResDto` |
| PATCH | `/products/:productId/bom/items/:itemId` | `products:bom-manage` | `UpdateBomItemReqDto` — `quantity`, `sortOrder`, `note` | `200` + `BomItemNodeResDto` |
| DELETE | `/products/:productId/bom/items/:itemId` | `products:bom-manage` | — | `204`, không có body |

(`*` = bắt buộc)

> ⚠️ **`GET .../bom` đang thực sự public dù có `@Permissions('products:read')`** — `@ApiPublic()` áp `Public()`, và cả hai guard toàn cục đều bỏ qua route có metadata đó. Xem ghi chú tương tự trong [`products.md`](products.md).

- **Route ghi dùng `products:bom-manage`**, không phải `products:update` — sửa cấu trúc là quyền tách riêng khỏi sửa thông tin sản phẩm.
- `GET` trả **mảng trần, không phân trang** — nó là một cây, chia trang không có nghĩa.
- `parentId` bỏ trống (hoặc `null`) = thêm node cấp 1 (con trực tiếp của gốc).
- `sortOrder` mặc định `0` khi không gửi.
- Mỗi node trong response gồm: `id`, `parentId`, `itemType`, `itemId`, `code`, `name` (Mã/Tên bản vẽ, lấy từ sản phẩm hoặc vật tư mà node trỏ tới), `image`, `unit`, `quantity`, `sortOrder`, `note`, cộng thêm `level`, `children`, `operations` khi đọc cả cây.
- `code`/`name`/`unit`/`image` được **làm phẳng bằng `coalesce` ngay trong SQL** từ phía product hoặc material — client không cần biết node trỏ vào bảng nào để hiển thị.
- `image` là `FileResDto` với `url` ký số có hạn (giống `products`), hoặc `null` khi sản phẩm/vật tư đó không có ảnh.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| `productId` không tồn tại / đã xoá mềm; hoặc `itemId` của node PRODUCT không tồn tại | `ErrorCode.E007` | 404 |
| `itemId` của node MATERIAL không tồn tại | `ErrorCode.E035` | 404 |
| Không tìm thấy node (kể cả khi sản phẩm chưa có BOM lúc `PATCH`/`DELETE`) | `ErrorCode.E050` | 404 |
| `parentId` không tồn tại trong BOM này | `ErrorCode.E051` | 404 |
| `parentId` trỏ tới node MATERIAL | `ErrorCode.E052` | 400 |
| Node PRODUCT trỏ tới sản phẩm không phải `WORK_IN_PROGRESS` | `ErrorCode.E053` | 400 |
| Phát hiện chu trình, hoặc vượt `MAX_BOM_DEPTH` | `ErrorCode.E054` | 409 |
| SL của node WIP không phải số nguyên | `ErrorCode.E055` | 400 |
| Role của caller thiếu `products:bom-manage` | `ErrorCode.E033` | 403 |

Lưu ý `E007` được dùng cho **hai** tình huống khác nhau khi `POST`: sản phẩm trong URL không tồn tại, và sản phẩm mà node mới trỏ tới không tồn tại. Client không phân biệt được hai ca này qua mã lỗi.

## Ngoài phạm vi

- Di chuyển / đổi cha một node (làm bằng xoá + thêm lại).
- Ghi hàng loạt cả cây trong một request — mô hình là ghi từng node theo thời gian thực.
- Tính triển khai nhu cầu vật tư (nổ BOM ra tổng số lượng theo sản lượng).
- Hiệu lực theo thời gian / phiên bản BOM — phiên bản làm bằng nhân bản cả sản phẩm, xem [`products.md`](products.md).
- Chống chu trình xuyên nhiều cây BOM.

## Xem thêm

- [`products.md`](products.md) — bảng gốc, và `POST /products/:id/copy` (clone cả cây này).
- [`routing.md`](routing.md) — routing as-used nhúng trong `operations` của mỗi node.
- `docs/architecture.md` — sơ đồ ER và thứ tự ghi của cả miền.
