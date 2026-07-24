# Tính năng: Supplier Groups (Nhóm nhà cung cấp)

## Mục đích

Danh mục chỉ-đọc dùng để phân loại nhà cung cấp (`suppliers.supplierGroupId`). Là nguồn dữ liệu cho dropdown "Nhóm nhà cung cấp" trên form nhà cung cấp.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá — dữ liệu được seed hoặc insert trực tiếp.
- **`code` là duy nhất** trong toàn bảng (`varchar(50)`).
- **`description` có trong bảng nhưng không được expose** ra `SupplierGroupResDto` — cùng chủ ý như [`client-groups.md`](client-groups.md): nơi tiêu thụ duy nhất là một dropdown.
- Quy tắc ràng buộc nằm ở phía tiêu thụ: `SuppliersService` từ chối `supplierGroupId` không khớp dòng nào với `E021`. Bản thân module này không bao giờ throw.
- **Module này từng bị xoá rồi rollback trong cùng ngày 2026-07-20**, cùng với `suppliers`. Nó đang tồn tại và là hiện hành — xem `.claude/rules/workflow.md`. Các `ErrorCode` giữ nguyên ý nghĩa gốc suốt vòng xoá-rồi-khôi-phục, nên chưa client nào từng thấy `E021` mang nghĩa khác.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/supplier-groups` | public | `GetSupplierGroupsReqDto` — `limit`, `page`, `q`, `order` | `200` + `SupplierGroupResDto` phân trang |

- `GetSupplierGroupsReqDto` **không thêm filter nào** — chỉ là `PageOptionsDto` trần.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `SupplierGroupResDto` là `{ id, code, name }` — không có `description`, không có timestamp.
- Có phân trang: đọc bao `{ data, pagination }`.

## Trường hợp lỗi

Không có. `SupplierGroupsService` chỉ có một method và không throw `AppException` nào.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Nhóm lồng nhau / phân cấp.
- Điều khoản thanh toán hay luồng duyệt theo nhóm.

## Xem thêm

- `suppliers` — nơi tiêu thụ, và là nơi throw `E021`. Chưa có doc; xem `src/api/suppliers/`.
- [`countries.md`](countries.md) — danh mục còn lại mà `suppliers` phụ thuộc vào.
