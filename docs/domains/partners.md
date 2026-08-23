# Partners & Master Data (Khách hàng, NCC, Danh mục)

## Purpose

Dữ liệu nền mà các domain nghiệp vụ trỏ FK vào: khách hàng, nhà cung cấp, và sáu danh mục phân loại
nhỏ. Vật tư (RM) không còn sống ở đây — đã gộp vào `items` cùng sản phẩm, xem
`docs/domains/product-structure.md` + `docs/decisions/items-merge.md`. Bản thân domain này gần như
không có nghiệp vụ — giá trị của nó nằm ở chỗ **nó bị ai tham chiếu và điều gì xảy ra khi nó thay
đổi**.

## Core concepts

**Danh mục là chỉ-đọc qua HTTP.** Sáu catalogue (nhóm khách hàng, nhóm NCC, quốc gia, phòng ban,
chức vụ, công đoạn) không có route tạo/sửa/xoá — dữ liệu vào bằng seed. Muốn thêm giá trị thì sửa
seed rồi chạy lại.

**Ràng buộc FK được kiểm ở phía tiêu thụ, không ở danh mục.** Các service danh mục gần như không bao giờ ném lỗi; chính module dùng nó (`ClientsService`, `SuppliersService`, `UsersService`) mới là nơi từ chối một id không tồn tại. Hệ quả khi đọc code: đừng tìm validation trong module danh mục.

**Không có domain Procurement.** Đây là điểm dễ giả định sai với một ERP sản xuất: hệ thống **không có** phiếu mua hàng, không có nhận hàng theo đơn mua, không có bảng giá NCC, không có công nợ. `suppliers` thuần là hồ sơ nhà cung cấp; `orders` là đơn **bán**, không phải đơn mua. Vật tư (RM trên `items`) vào kho bằng phiếu nhập lập tay (`PNK`, `receiptType = PURCHASE`) — có `supplierId` nhưng vẫn không phải chứng từ mua hàng, xem `docs/decisions/no-procurement.md`.

**Liên hệ của khách hàng là replace-all.** Mỗi lần sửa khách hàng, toàn bộ `client_contacts` bị xoá rồi chèn lại. Đây chính là lý do `orders` phải snapshot người liên hệ thay vì giữ FK — xem `docs/domains/orders.md`.

## Entities

| Entity | Vai trò | Ai tham chiếu |
| --- | --- | --- |
| `clients` (+ `client_contacts`) | Khách hàng và danh bạ liên hệ | `orders.clientId`; snapshot liên hệ trên `orders` |
| `suppliers` (+ payment info, representatives, files) | Nhà cung cấp | `items.supplierId` (NCC chính, chỉ RM) |
| 6 catalogue nhỏ | Phân loại + cơ cấu tổ chức | `clients`/`suppliers`/`items`/`users`/`routing` |

`supplier_payment_info` là **1-1** và merge từng phần khi update; `supplier_representatives` và `supplier_files` là **replace-all**.

## Lifecycle

`clients`, `suppliers` đều **xoá mềm**. Danh mục nhỏ không có route xoá.

`SupplierStatus` = `ACTIVE | PAUSED | STOPPED` — chỉ dùng để lọc và thống kê, không gác nghiệp vụ nào.

## Business rules

- Mã (`code`) tự sinh nếu không gửi, theo tiền tố riêng từng loại (`NCC` cho supplier), và **bất biến** sau khi tạo.
- `taxCode` của NCC là duy nhất.
- Logo/đính kèm luôn đi qua registry `files` — **ngoại lệ duy nhất toàn hệ thống là `countries.logoUrl`**, một URL trần, vì cờ quốc gia là tài nguyên tĩnh của bên thứ ba chứ không phải file người dùng upload.
- `paymentTermEnum` được **khai báo ở `suppliers`** nhưng `orders` import lại và dùng chung PG enum đó — đổi/thêm giá trị ảnh hưởng cả hai domain.

## Invariants

- Mã của các bảng xoá mềm là unique **trên toàn bảng, không chỉ dòng còn sống** — nên mã của một bản ghi đã xoá mềm **không bao giờ dùng lại được**.

Không phải invariant dù dễ tưởng:

- **Xoá mềm một NCC không dọn gì cả.** `items.supplierId` vẫn trỏ tới nó (FK `set null` chỉ kích hoạt khi xoá cứng), và cả `items` lẫn màn tồn kho vật tư đều **không lọc `suppliers.deletedAt`** — nên một NCC đã xoá vẫn hiện lồng trong response của vật tư, trong khi `GET /suppliers/:id` trả 404. Bất nhất đã biết.
- **Sinh mã NCC có thể trùng.** Bộ đếm là `COUNT(*) + 1` **không lọc dòng đã xoá mềm** và không kiểm lại tính duy nhất sau khi sinh — sau một lần xoá mềm, hoặc khi đã có mã nhập tay dạng `NCC0002`, mã sinh ra có thể đụng và nổi lên thành lỗi unique thô của Postgres thay vì `E020` sạch.
- **`creditLimit` của NCC chỉ được lưu, chưa nơi nào dùng.** `rating` cũng là số nhập tay, không tính từ dữ liệu.

## Cross-domain dependencies

- **→ Orders**: `clientId` + snapshot liên hệ; enum `PaymentTerm`.
- **→ Product Structure**: `suppliers` được `items` (RM) tham chiếu làm NCC chính; `operations` là danh mục cho routing.
- **→ Inventory**: `suppliers` dùng để lọc màn tồn kho vật tư.
- **→ Identity**: `departments`/`positions` là cơ cấu tổ chức cho hồ sơ nhân sự.

## Common mistakes

1. **Đi tìm luồng mua hàng.** Không tồn tại. Đừng suy ra từ việc có `suppliers` rằng đã có procurement.
2. **Tưởng danh mục tự validate FK.** Không — module tiêu thụ mới ném lỗi (`E021`, `E023`, `E026`, ...).
3. **Sửa liên hệ khách hàng bằng cách gửi một phần.** Là replace-all — gửi thiếu là xoá.
4. **Dựa vào id của một dòng `client_contacts`** như thể nó ổn định. Không phải; nó đổi mỗi lần khách hàng được sửa.
5. **Sửa/thêm giá trị `paymentTermEnum` mà chỉ nghĩ tới `suppliers`.** `orders` dùng chung enum đó.
6. **Tưởng `supplier_payment_info` là replace-all giống các bảng con khác.** Nó là 1-1 và merge từng phần.
7. **Đi tìm vật tư (`materials`) ở domain này.** Đã chuyển sang `items` (`type = RM`), xem
   `docs/domains/product-structure.md`.

## Related docs

- `docs/decisions/no-procurement.md` — vì sao không có mua hàng, và điểm cắm nếu sau này làm.
- `docs/decisions/items-merge.md` — vì sao vật tư chuyển sang `items`.
- `docs/workflows/stock-movement.md` — nơi RM (`items`) được nhập/xuất kho.
- `docs/domains/orders.md` — vì sao liên hệ phải snapshot.
- `docs/domains/product-structure.md` — nơi RM sống sau khi gộp.
