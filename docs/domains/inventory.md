# Inventory (Kho thành phẩm & Kho vật tư)

## Purpose

Trả lời "còn bao nhiêu hàng" bằng cách **cộng lại từ chứng từ**, không bằng cách giữ một con số tồn. Phục vụ hai kho: thành phẩm và vật tư.

## Core concepts

**Tồn kho không được lưu ở bất kỳ đâu.** Không có cột `onHand`/`stock`/`quantity` trên `products` hay bảng nào khác. Mọi con số đều tính lại từ sổ chứng từ tại thời điểm đọc, hoàn toàn trong Postgres. Đây là quyết định kiến trúc trung tâm của domain — và là lý do mọi hướng mở rộng sau này (nhiều kho, khoá sổ, giữ hàng thủ công) đều là *cộng thêm*, không phải migrate lại số tồn đã lưu.

**Ba con số, ba ý nghĩa khác nhau:**

```
onHand    = Σ nhập − Σ xuất                       (thực tế đang có)
reserved  = phần chưa giao của các dòng đơn đã duyệt (đã hứa với khách)
available = onHand − reserved                      (còn bán được)
```

`reserved` chỉ tính đơn **đã được Giám đốc duyệt** (`AWAITING_PRODUCTION`/`IN_PROGRESS`). Đơn nháp hay chờ xác nhận **không giữ chỗ** — chưa cam kết thì chưa chiếm hàng.

**Một sổ, hai kho.** `stock_receipts.subject` (`FINISHED_GOOD`/`MATERIAL`) tách phiếu thành phẩm khỏi phiếu vật tư, thay vì dựng hai bảng riêng. `subject` **bất biến** sau khi tạo, và quyết định dòng phiếu dùng `productId` hay `materialId`.

**Không có loại phiếu "điều chỉnh".** Dấu của biến động nằm hoàn toàn ở `type` (`IN`/`OUT`); số lượng trên mọi dòng luôn dương. Kiểm kê thừa ghi bằng phiếu `IN`/`STOCKTAKE`, kiểm kê thiếu bằng `OUT`/`STOCKTAKE`.

## Entities

| Entity | Vai trò |
| --- | --- |
| `stock_receipts` | Phiếu nhập/xuất; `subject` + `type` + `reason` phải khớp nhau |
| `stock_receipt_items` | Dòng phiếu; **đúng một trong** `productId`/`materialId`; `orderItemId` tuỳ chọn |

`orderItemId` trên dòng phiếu là **chỗ nối duy nhất sang Orders** — vừa là cơ sở tính `reserved`, vừa chính là delivery tracking mà Orders chưa có.

## Lifecycle

Phiếu **không có vòng đời trạng thái** — không có `DRAFT`/`POSTED`/`LOCKED`. Một phiếu đã lập sửa/xoá được bất cứ lúc nào (xoá mềm). Ràng buộc duy nhất là bất biến "không âm tồn", áp dụng cho cả khi sửa.

Đây là điểm khác hẳn `orders` (vốn khoá theo trạng thái). Khoá sổ/bút toán đảo là hướng mở rộng đã tính trước, chưa làm.

## Business rules

- `reason` phải thuộc đúng cặp (`subject`, `type`) — enforce ở **cả DB CHECK lẫn service** (service ném `E073` sạch thay vì để lộ lỗi constraint 500 thô).
- **Chặn xuất kho làm tồn âm** (`E071`): tính theo `(productId, materialId)`, gộp mọi dòng `OUT` trong cùng yêu cầu. Khi **sửa** phiếu, tồn được tính **loại trừ chính các dòng hiện có của phiếu đó** — nếu không sẽ đếm dòng cũ hai lần.
- `orderItemId` chỉ hợp lệ trên **dòng thành phẩm của phiếu `OUT`**, và `productId` phải khớp dòng đơn hàng (`E072`). Luôn bị từ chối trên dòng vật tư — nó là chỗ nối tới nhu cầu thành phẩm, vô nghĩa với vật tư.
- Mã phiếu sinh theo `subject`: `PN`/`PX` (thành phẩm) vs `PNVT`/`PXVT` (vật tư), **đếm riêng từng cặp** nên hai kho không tranh số thứ tự.
- `items` trên `PATCH` là **replace-all**.
- Danh sách tồn kho chạy trên **danh mục**, không phải trên phiếu — một sản phẩm chưa từng nhập kho vẫn hiện với `onHand: 0`. Đúng nhu cầu của LSX: cần thấy cả thứ chưa từng sản xuất.

## Invariants

- Tồn kho luôn suy ra được từ sổ phiếu — không có con số tồn nào để lệch.
- Mọi `quantity` trên dòng phiếu đều dương (DB CHECK); dấu nằm ở `type`.
- Mỗi dòng phiếu trỏ đúng một trong `productId`/`materialId` (DB CHECK).
- Không thao tác nào qua API làm tồn một mặt hàng xuống âm.

Không phải invariant dù dễ tưởng:

- **DB không đảm bảo dòng phiếu khớp `subject` của header.** CHECK chỉ đảm bảo "đúng một trong hai" — nó không đọc được row cha. Khớp đúng `subject` là trách nhiệm của service (`E086`).
- **`reserved`/`bomDemand` của vật tư hiện luôn bằng 0** — chưa có Phiếu lãnh vật tư, chưa nổ BOM. Vì `available = onHand` và tồn đã bị chặn âm, trạng thái `SHORTAGE` của vật tư **chưa bao giờ xuất hiện thực tế**.

## Cross-domain dependencies

- **← Orders**: dòng đơn của đơn **đã duyệt** tạo ra `reserved`. Đây là phụ thuộc một chiều — Inventory đọc Orders, không ghi ngược.
- **← Production**: chỉ đọc, qua `getStockLevels(excludeOrderId)`. **Production không ghi phiếu kho nào** — phần "Lấy từ tồn" khi duyệt LSX hiện không sinh chứng từ.
- **← Product Structure**: chỉ thấy sản phẩm `FINISHED_GOOD` + `ACTIVE`. WIP không có mặt trong kho.
- **← Materials / Suppliers**: màn tồn kho vật tư lọc theo nhóm vật tư và NCC chính.

## Common mistakes

1. **Đi tìm cột tồn kho để cập nhật.** Không có. Muốn đổi tồn thì lập phiếu.
2. **Dùng `available` của màn Kho khi tính cho một PO cụ thể.** Sẽ trừ nhu cầu của chính PO đó hai lần — phải truyền `excludeOrderId`.
3. **Quên loại trừ dòng cũ khi kiểm tồn lúc sửa phiếu** → chặn nhầm một thao tác hợp lệ.
4. **Gắn `orderItemId` vào dòng vật tư** — luôn `E072`.
5. **Tưởng `subject` sửa được sau khi tạo phiếu.** Bất biến, cùng luật với `code`.
6. **Tưởng vật tư đã có "đã giữ"/"tổng nhu cầu BOM" thật.** Hai field đó là **chỗ cắm sẵn**, giá trị 0 là do phạm vi hiện tại, không phải bug.
7. **Tưởng có bảng giao hàng.** Không — `orderItemId` trên phiếu `OUT` là thứ gần nhất với delivery tracking, và `GET /orders/stats` vẫn dùng proxy `status = COMPLETED`.

## Related docs

- `docs/workflows/stock-movement.md` — trình tự lập/sửa/xoá phiếu và sáu tình huống nghiệp vụ.
- `docs/domains/orders.md` — nguồn của `reserved`.
- `docs/domains/production.md` — nơi tiêu thụ `onHand`/`reserved`.
