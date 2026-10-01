# Đối tác: khách hàng và nhà cung cấp

Phạm vi: `src/api/` các thư mục `clients`, `client-groups`, `suppliers`, `supplier-groups`, `countries`. Schema ở `src/database/schemas/clients/`, `src/database/schemas/suppliers/`, `countries.ts`. Phần sản phẩm, BOM, công đoạn và đơn vị tính nằm ở [product-structure.md](product-structure.md); registry tệp ở [architecture.md](../architecture.md).

Điểm chung của nhóm này:

- Mã (`code`) do người dùng tự đặt; không có mã tự sinh cho khách hàng hay nhà cung cấp (`DocumentType.SUPPLIER` có trong enum nhưng **không có nơi nào dùng**).
- Xoá mềm bằng `deletedAt`. Khoá ngoại từ các bảng chứng từ là `restrict`, nhưng xoá mềm không kích hoạt `restrict`, nên service tự kiểm "đang được dùng" trước khi xoá và trả mã `*.error.in_use` (409). Phép kiểm cố ý **không** lọc `deletedAt` của bảng chứng từ, vì dòng đã xoá mềm vẫn giữ khoá ngoại.
- Tìm kiếm dùng `unaccentILike` (không phân biệt dấu, hoa thường).

## Khách hàng (`/clients`) và nhóm khách hàng

| Bảng | Ghi chú |
|---|---|
| `clients` | `code` (unique chỉ trong các dòng chưa xoá, `uq_clients_code_active`), `name`, `clientGroupId` bắt buộc, `taxCode`, `phoneNumber`, `email`, `address`, `note`, `status` `ACTIVE`/`PAUSED`. |
| `client_contacts` | Người liên hệ, nhiều dòng mỗi khách hàng: `name`, `position`, `phoneNumber`, `email`, `note`, `isPrimary`. |
| `client_groups` | Nhóm khách hàng: `code` unique, `name`, `description`. Chỉ có route đọc. |

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /clients` | `clients:read` | Phân trang. Tìm theo mã, tên, MST, email, SĐT và tên người liên hệ; lọc `status`, `clientGroupId`. |
| `GET /clients/options` | `clients:read` | Cho select box: chỉ tìm theo mã và tên, sắp theo tên, **tối đa 100 dòng**. |
| `GET /clients/:clientId` | `clients:read` | Chi tiết. `E009` nếu không thấy. |
| `GET /clients/:clientId/contacts` | `clients:read` | Danh sách người liên hệ. |
| `POST /clients` | `clients:create` | Kiểm mã (`E024`), MST (`E025`), nhóm tồn tại (`E026`). Ghi client rồi ghi contacts. |
| `PATCH /clients/:clientId` | `clients:update` | Gửi `contacts` thì **thay toàn bộ** danh sách (xoá hết rồi chèn lại); không gửi thì giữ nguyên. |
| `DELETE /clients/:clientId` | `clients:delete` | Xoá mềm. Còn đơn hàng (`orders`) hoặc phiếu giao (`outbound_orders`) trỏ tới thì `E246`. |
| `GET /client-groups` | công khai | Danh sách nhóm. |

Create/update client ghi `clients` rồi mới ghi `contacts` ở lệnh riêng, **không bọc trong transaction**; lỗi giữa chừng có thể để lại client không có contacts.

## Nhà cung cấp (`/suppliers`) và nhóm nhà cung cấp, quốc gia

| Bảng | Ghi chú |
|---|---|
| `suppliers` | `code` unique (không phân biệt xoá mềm), `name`, `supplierGroupId`, `countryId`, `type` `INDIVIDUAL`/`COMPANY`/`HOUSEHOLD`, `taxCode` unique, `address` bắt buộc, `rating`, `status` `ACTIVE`/`PAUSED`/`STOPPED`, `logoFileId`, `internalNote`. |
| `supplier_payment_info` | 1-1 với supplier, **luôn tạo cùng lúc** với supplier: ngân hàng, số tài khoản, phương thức thanh toán mặc định (`CASH`/`BANK_TRANSFER`), kỳ hạn mặc định (`IMMEDIATE`/`NET_15`/`NET_30`/`NET_60`), hạn mức công nợ (VND, không âm) và ngày bắt đầu hạn mức. |
| `supplier_representatives` | Người đại diện, nhiều dòng: `name`, `phoneNumber`, `isPrimary`. |
| `supplier_files` | Tệp đính kèm, liên kết sang bảng `files`. |
| `supplier_groups`, `countries` | Danh mục nhỏ chỉ có route đọc. |

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /suppliers` | `suppliers:read` | Phân trang, có bộ lọc. |
| `GET /suppliers/stats` | `suppliers:read` | Số nhà cung cấp theo trạng thái: tổng, `active`, `paused`, `stopped`. |
| `GET /suppliers/:supplierId` | `suppliers:read` | Chi tiết kèm thanh toán, đại diện, tệp. |
| `POST /suppliers` | `suppliers:create` | Trả về chi tiết (khác clients). Trong **một transaction**: ghi supplier, `supplier_payment_info`, tệp, đại diện. |
| `PATCH /suppliers/:supplierId` | `suppliers:update` | Trả về chi tiết. `payment` chỉ ghi đè các trường gửi lên; `fileIds` và `representatives` nếu gửi thì thay toàn bộ. |
| `DELETE /suppliers/:supplierId` | `suppliers:delete` | Xoá mềm. Còn dữ liệu trong `purchase_orders`, `purchase_quotation_item_suppliers`, `outsourcing_orders`, `outsourcing_receipts` hoặc `supplier_returns` thì `E247`. |
| `GET /supplier-groups`, `GET /countries` | công khai | Danh sách nhóm / quốc gia. |

Mã lỗi: `E019` không thấy NCC, `E020` mã trùng, `E021` nhóm không có, `E022` MST trùng, `E023` quốc gia không có.


## Bảng mã lỗi của khu vực

| Mã | HTTP | Ý nghĩa |
|---|---|---|
| E009 | 404 | Không thấy khách hàng |
| E019 | 404 | Không thấy nhà cung cấp |
| E020 / E022 | 409 | NCC: mã trùng / MST trùng |
| E021 / E023 | 404 | NCC: nhóm không có / quốc gia không có |
| E024 / E025 | 409 | Khách hàng: mã trùng / MST trùng |
| E026 | 404 | Nhóm khách hàng không có |
| E246 / E247 | 409 | Khách hàng / NCC còn đang được dùng |
