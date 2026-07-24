# Tính năng: Client Groups (Nhóm khách hàng)

## Mục đích

Danh mục chỉ-đọc dùng để phân loại khách hàng (`clients.clientGroupId`), phục vụ lọc và báo cáo danh sách khách hàng theo nhóm. Là nguồn dữ liệu cho dropdown "Nhóm khách hàng" trên form khách hàng.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá — dữ liệu được seed hoặc insert trực tiếp. Màn hình quản trị là việc của tương lai và cần route riêng.
- **`code` là duy nhất** trong toàn bảng (`varchar(50)`).
- **`description` có trong bảng nhưng không được expose** ra `ClientGroupResDto`. Đây là chủ ý chứ không phải sót: nơi tiêu thụ duy nhất là một dropdown. Muốn thêm thì phải khai báo property có `@Expose()` — theo `.claude/rules/dto.md`, property thiếu `@Expose()` sẽ biến mất khỏi response mà không báo lỗi.
- Quy tắc ràng buộc nằm ở phía tiêu thụ: `ClientsService` từ chối `clientGroupId` không khớp dòng nào với `E026`. Bản thân module này không bao giờ throw.
- Nhóm của khách hàng là **tuỳ chọn** (`clients.clientGroupId` nullable) — khách hàng không thuộc nhóm nào vẫn hợp lệ.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/client-groups` | public | `GetClientGroupsReqDto` — `limit`, `page`, `q`, `order` | `200` + `ClientGroupResDto` phân trang |

- `GetClientGroupsReqDto` **không thêm filter nào** — chỉ là `PageOptionsDto` trần.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `ClientGroupResDto` là `{ id, code, name }` — không có `description`, không có timestamp.
- Có phân trang: đọc bao `{ data, pagination }`, đừng giả định cả danh mục nằm gọn trong `limit = 10` mặc định.

## Trường hợp lỗi

Không có. `ClientGroupsService` chỉ có một method và không throw `AppException` nào.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Nhóm lồng nhau / phân cấp — mỗi khách hàng thuộc tối đa một nhóm phẳng.
- Quy tắc giá, chiết khấu hay điều khoản thanh toán theo nhóm.

## Xem thêm

- `clients` — nơi tiêu thụ, và là nơi throw `E026`. Chưa có doc; xem `src/api/clients/`.
- [`supplier-groups.md`](supplier-groups.md), [`material-groups.md`](material-groups.md) — cùng hình dạng, khác nghiệp vụ.
