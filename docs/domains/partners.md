# Partners & Master Data (Khách hàng, NCC, Danh mục)

## Purpose

Dữ liệu nền mà các domain nghiệp vụ trỏ FK vào: khách hàng, nhà cung cấp, và các danh mục phân loại
nhỏ. Vật tư (RM) không sống ở đây — đã gộp vào `items`, xem `docs/domains/product-structure.md`.
Giá trị của domain này nằm ở chỗ nó bị ai tham chiếu và điều gì xảy ra khi nó thay đổi.

## Core concepts

**Đa số danh mục chỉ-đọc qua HTTP** — nhóm khách hàng, nhóm NCC, quốc gia, phòng ban, chức vụ không
có route tạo/sửa/xoá, dữ liệu vào bằng seed. **`operations` là ngoại lệ** — full CRUD (`create`/
`update`/`delete`, `E248` khi đang được routing/BOM dùng), dù cùng vai trò danh mục.

**Ràng buộc FK được kiểm ở phía tiêu thụ, không ở danh mục** — `ClientsService`/`SuppliersService`/
`UsersService` mới là nơi từ chối một id không tồn tại; đừng tìm validation trong module danh mục.

**Mua hàng có tồn tại** — 5 module `purchase-requests`/`purchase-quotations`/`purchase-orders`/
`payment-requests`/`purchase-ledger` (`docs/domains/purchasing.md`, `docs/domains/purchase-requests.md`)
đã đảo ngược phần lớn quyết định "không mua hàng" ban đầu; giới hạn còn lại (không công nợ/kế toán
thật, không bảng giá theo thời gian) ở `docs/decisions/purchasing-scope-limits.md`.

**Liên hệ của khách hàng là replace-all** — mỗi lần sửa, toàn bộ `client_contacts` xoá rồi chèn lại.
`orders` **không** snapshot liên hệ nào — chỉ giữ `clientId`, đọc liên hệ hiện hành qua quan hệ.

## Entities

| Entity | Vai trò | Ai tham chiếu |
| --- | --- | --- |
| `clients` (+ `client_contacts`) | Khách hàng và danh bạ liên hệ | `orders.clientId`, `outbound_orders.clientId` |
| `suppliers` (+ payment info, representatives, files) | Nhà cung cấp | `items.supplierId` (chính, RM); `purchase_orders`/`purchase_quotation_item_suppliers`/`qc_requests`/`outsourcing_orders`/`supplier_returns`/`inventory_receipts.supplierId` |
| Danh mục nhỏ (5 chỉ-đọc + `operations`) | Phân loại + cơ cấu tổ chức + công đoạn | `clients`/`suppliers`/`items`/`users`/routing/BOM |

`supplier_payment_info` là 1-1, merge từng phần khi update; `supplier_representatives`/
`supplier_files` là replace-all.

## Lifecycle

`clients`, `suppliers` xoá mềm. 5 danh mục nhỏ không có route xoá; `operations` full CRUD (soft
delete qua `deletedAt`, chặn `E248` nếu đang dùng).

`SupplierStatus = ACTIVE | PAUSED | STOPPED` — chỉ lọc/thống kê, không gác nghiệp vụ.

## Business rules

- Mã (`code`) tự sinh nếu không gửi qua `document_sequences` (atomic), bất biến sau khi tạo.
- `taxCode` của NCC duy nhất.
- Logo/đính kèm qua registry `files` — ngoại lệ duy nhất `countries.logoUrl` (URL trần, tài nguyên
  tĩnh bên thứ ba).
- `paymentTermEnum` khai ở `suppliers` nhưng `orders`/`purchase_orders` dùng chung PG enum đó —
  đổi/thêm giá trị ảnh hưởng cả ba domain.

## Invariants

- Mã của bảng xoá mềm unique toàn bảng (không chỉ dòng sống) — mã đã xoá mềm không bao giờ dùng lại
  được.

Không phải invariant dù dễ tưởng:

- **Xoá mềm một NCC không dọn gì** — `items.supplierId` vẫn trỏ tới nó, `items`/màn tồn kho vật tư
  không lọc `suppliers.deletedAt` — NCC đã xoá vẫn hiện lồng trong response vật tư dù
  `GET /suppliers/:id` trả 404.
- `creditLimit`/`rating` của NCC chỉ được lưu, chưa nơi nào dùng/tính.

## Cross-domain dependencies

- **→ Orders**: `clientId`; `paymentTermEnum` dùng chung.
- **→ Purchasing**: `suppliers` là bên NCC cho RFQ/PO/gia công ngoài — xem Entities.
- **→ Product Structure**: `suppliers` được `items` (RM) tham chiếu làm NCC chính; `operations` là
  danh mục cho routing/BOM.
- **→ Inventory**: `suppliers` dùng lọc màn tồn kho vật tư, gắn trên phiếu nhập/OS-OUT/OS-IN.
- **→ Identity**: `departments`/`positions` là cơ cấu tổ chức cho hồ sơ nhân sự.

## Common mistakes

1. Tưởng hệ thống không có mua hàng — 5 module purchasing đã tồn tại, chỉ còn giới hạn về công nợ/
   kế toán thật (`docs/decisions/purchasing-scope-limits.md`).
2. Tưởng `operations` chỉ đọc như 5 danh mục kia — nó full CRUD.
3. Tưởng danh mục tự validate FK — module tiêu thụ mới ném lỗi.
4. Sửa liên hệ khách hàng bằng cách gửi một phần — là replace-all, gửi thiếu là xoá.
5. Dựa vào id của một dòng `client_contacts` như thể ổn định — nó đổi mỗi lần khách hàng được sửa.
6. Tưởng `orders` snapshot liên hệ khách hàng — không, chỉ giữ `clientId`.
7. Tưởng `supplier_payment_info` là replace-all như các bảng con khác — nó 1-1, merge từng phần.
8. Đi tìm vật tư (`materials`) ở domain này — đã chuyển sang `items` (`type = RM`).

## Related docs

- `docs/decisions/purchasing-scope-limits.md` — giới hạn còn lại của mua hàng.
- `docs/decisions/items-merge.md` — vì sao vật tư chuyển sang `items`.
- `docs/domains/purchasing.md`, `docs/domains/purchase-requests.md` — luồng mua hàng đầy đủ.
- `docs/domains/orders.md`, `docs/domains/product-structure.md`.
