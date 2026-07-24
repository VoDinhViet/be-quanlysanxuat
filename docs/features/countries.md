# Tính năng: Countries (Quốc gia)

## Mục đích

Danh mục quốc gia chỉ-đọc, tồn tại vì đúng một lý do: `suppliers.countryId` cần chỗ để trỏ tới, và form nhà cung cấp cần dữ liệu cho dropdown. Hiện chưa có nơi nào khác trong hệ thống dùng tới nó.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá — dữ liệu được nạp bằng migration/seed. Màn hình quản trị là việc của tương lai; nếu có thì phải làm route riêng, không gắn thao tác ghi vào endpoint danh sách này.
- **`code` là duy nhất**, chứa mã ISO 3166-1 alpha-2 (`VN`, `JP`, `CN`). Cột khai báo `varchar(10)` — rộng hơn 2 ký tự alpha-2 cần — nên sau này đổi sang chuẩn dài hơn không phải migration.
- **`logoUrl` là chuỗi URL thuần, không phải một dòng trong `files`.** Cờ quốc gia là tài nguyên tĩnh của bên thứ ba, không phải file người dùng upload, nên cố ý nằm ngoài registry `files` (khác với `logoFileId` của suppliers). Cột này nullable — quốc gia không có cờ là bình thường.
- Quy tắc duy nhất liên quan nằm ở phía tiêu thụ: `SuppliersService` từ chối `countryId` không khớp dòng nào với `E023`. Bản thân module này không bao giờ throw.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/countries` | public | `GetCountriesReqDto` — `limit`, `page`, `q`, `order` | `200` + `CountryResDto` phân trang |

- `GetCountriesReqDto` **không thêm filter nào** — chỉ là `PageOptionsDto` trần.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`, nên gõ "viet" vẫn ra "Việt Nam".
- Sắp xếp **mới nhất trước** (`created_at DESC`), giống mặc định của các endpoint danh sách phân trang khác. Với một dropdown thì thứ tự này khá tuỳ tiện — cần sắp theo alphabet thì tự sắp ở client.
- `CountryResDto` là `{ id, code, name, logoUrl }` — không có timestamp.
- Có phân trang, khác `GET /units` (trả mảng trần). Nếu danh sách seed vượt quá `limit = 10` mặc định, dropdown nào bỏ qua bao `{ data, pagination }` sẽ âm thầm chỉ hiển thị trang đầu.

## Trường hợp lỗi

Không có. `CountriesService` chỉ có một method và không throw `AppException` nào — không tìm thấy gì thì trả `200` với `data: []`.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Tỉnh/thành phố hay bất kỳ đơn vị hành chính cấp dưới nào.
- Mã vùng điện thoại, tiền tệ, locale — mỗi dòng chỉ gồm mã + tên + cờ.
