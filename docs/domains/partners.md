# Partners & Master Data (Khách hàng, NCC, Vật tư, Danh mục)

## Purpose

Dữ liệu nền mà các domain nghiệp vụ trỏ FK vào: khách hàng, nhà cung cấp, vật tư, và bảy danh mục phân loại nhỏ. Bản thân domain này gần như không có nghiệp vụ — giá trị của nó nằm ở chỗ **nó bị ai tham chiếu và điều gì xảy ra khi nó thay đổi**.

## Core concepts

**Danh mục là chỉ-đọc qua HTTP.** Bảy catalogue (nhóm khách hàng, nhóm NCC, nhóm vật tư, quốc gia, phòng ban, chức vụ, công đoạn) không có route tạo/sửa/xoá — dữ liệu vào bằng seed. Muốn thêm giá trị thì sửa seed rồi chạy lại.

**Ràng buộc FK được kiểm ở phía tiêu thụ, không ở danh mục.** Các service danh mục gần như không bao giờ ném lỗi; chính module dùng nó (`ClientsService`, `SuppliersService`, `MaterialsService`, `UsersService`) mới là nơi từ chối một id không tồn tại. Hệ quả khi đọc code: đừng tìm validation trong module danh mục.

**Không có domain Procurement.** Đây là điểm dễ giả định sai với một ERP sản xuất: hệ thống **không có** phiếu mua hàng, không có nhận hàng theo đơn mua, không có bảng giá NCC, không có công nợ. `suppliers` thuần là hồ sơ nhà cung cấp; `orders` là đơn **bán**, không phải đơn mua. Vật tư vào kho bằng phiếu nhập lập tay (`PNVT`, lý do `PURCHASE`).

**Liên hệ của khách hàng là replace-all.** Mỗi lần sửa khách hàng, toàn bộ `client_contacts` bị xoá rồi chèn lại. Đây chính là lý do `orders` phải snapshot người liên hệ thay vì giữ FK — xem `docs/domains/orders.md`.

## Entities

| Entity | Vai trò | Ai tham chiếu |
| --- | --- | --- |
| `clients` (+ `client_contacts`) | Khách hàng và danh bạ liên hệ | `orders.clientId`; snapshot liên hệ trên `orders` |
| `suppliers` (+ payment info, representatives, attachments) | Nhà cung cấp | `materials.supplierId` (NCC chính) |
| `materials` | Vật tư | `bom_items.materialId`, `stock_receipt_items.materialId` |
| 7 catalogue nhỏ | Phân loại + cơ cấu tổ chức | Xem `docs/features/master-data.md` |

`supplier_payment_info` là **1-1** và merge từng phần khi update; `supplier_representatives` và các bảng attachment là **replace-all**.

## Lifecycle

`clients`, `suppliers`, `materials` đều **xoá mềm**. Danh mục nhỏ không có route xoá.

`SupplierStatus` = `ACTIVE | PAUSED | STOPPED` — chỉ dùng để lọc và thống kê, không gác nghiệp vụ nào.

## Business rules

- Mã (`code`) tự sinh nếu không gửi, theo tiền tố riêng từng loại (`NCC` cho supplier), và **bất biến** sau khi tạo.
- `taxCode` của NCC là duy nhất.
- Logo/đính kèm luôn đi qua registry `files` — **ngoại lệ duy nhất toàn hệ thống là `countries.logoUrl`**, một URL trần, vì cờ quốc gia là tài nguyên tĩnh của bên thứ ba chứ không phải file người dùng upload.
- `paymentTermEnum` được **khai báo ở `suppliers`** nhưng `orders` import lại và dùng chung PG enum đó — đổi/thêm giá trị ảnh hưởng cả hai domain.
- Nhóm vật tư là danh mục **duy nhất trong bảy cái yêu cầu quyền** (`materials:read`); sáu cái còn lại public.

## Invariants

- Một vật tư đang được dùng trong bất kỳ node BOM nào thì không xoá được.
- Mã của các bảng xoá mềm là unique **trên toàn bảng, không chỉ dòng còn sống** — nên mã của một bản ghi đã xoá mềm **không bao giờ dùng lại được**.

Không phải invariant dù dễ tưởng:

- **Xoá mềm một NCC không dọn gì cả.** `materials.supplierId` vẫn trỏ tới nó (FK `set null` chỉ kích hoạt khi xoá cứng), và cả `materials` lẫn màn tồn kho vật tư đều **không lọc `suppliers.deletedAt`** — nên một NCC đã xoá vẫn hiện lồng trong response của vật tư, trong khi `GET /suppliers/:id` trả 404. Bất nhất đã biết.
- **Sinh mã NCC có thể trùng.** Bộ đếm là `COUNT(*) + 1` **không lọc dòng đã xoá mềm** và không kiểm lại tính duy nhất sau khi sinh — sau một lần xoá mềm, hoặc khi đã có mã nhập tay dạng `NCC0002`, mã sinh ra có thể đụng và nổi lên thành lỗi unique thô của Postgres thay vì `E020` sạch.
- **`creditLimit` của NCC chỉ được lưu, chưa nơi nào dùng.** `rating` cũng là số nhập tay, không tính từ dữ liệu.

## Cross-domain dependencies

- **→ Orders**: `clientId` + snapshot liên hệ; enum `PaymentTerm`.
- **→ Product Structure**: `materials` là node lá của BOM; `operations` là danh mục cho routing.
- **→ Inventory**: `materials` là chủ thể của kho vật tư; `suppliers` dùng để lọc.
- **→ Identity**: `departments`/`positions` là cơ cấu tổ chức cho hồ sơ nhân sự.

## Common mistakes

1. **Đi tìm luồng mua hàng.** Không tồn tại. Đừng suy ra từ việc có `suppliers` + `materials` rằng đã có procurement.
2. **Tưởng danh mục tự validate FK.** Không — module tiêu thụ mới ném lỗi (`E021`, `E023`, `E026`, `E037`, ...).
3. **Sửa liên hệ khách hàng bằng cách gửi một phần.** Là replace-all — gửi thiếu là xoá.
4. **Dựa vào id của một dòng `client_contacts`** như thể nó ổn định. Không phải; nó đổi mỗi lần khách hàng được sửa.
5. **Sửa/thêm giá trị `paymentTermEnum` mà chỉ nghĩ tới `suppliers`.** `orders` dùng chung enum đó.
6. **Tưởng `supplier_payment_info` là replace-all giống các bảng con khác.** Nó là 1-1 và merge từng phần.

## Related docs

- `docs/features/master-data.md` — bảy danh mục nhỏ.
- `docs/features/suppliers.md`, `clients.md`, `materials.md` — API contract từng module.
- `docs/domains/orders.md` — vì sao liên hệ phải snapshot.
