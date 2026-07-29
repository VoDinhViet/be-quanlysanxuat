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
| GET | `/countries` | public | `GetCountriesReqDto` — `q` | `200` + mảng `CountryResDto` |

- `GetCountriesReqDto` **chỉ có `q`** — class trần, không `extends PageOptionsDto`.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`, nên gõ "viet" vẫn ra "Việt Nam".
- Sắp xếp **alphabet theo `name`** (`asc`), vì danh sách đổ thẳng vào dropdown chọn quốc gia.
- `CountryResDto` là `{ id, code, name, logoUrl }` — không có timestamp.
- **Không phân trang**, giống `GET /units`/`GET /roles` — trả mảng trần, không còn rủi ro cắt ở `limit = 10` như trước.

## Trường hợp lỗi

Không có. `CountriesService` chỉ có một method và không throw `AppException` nào — không tìm thấy gì thì trả `200` với `[]`.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Tỉnh/thành phố hay bất kỳ đơn vị hành chính cấp dưới nào.
- Mã vùng điện thoại, tiền tệ, locale — mỗi dòng chỉ gồm mã + tên + cờ.

## Ghi chú tích hợp frontend (2026-07-28)

**Breaking change.** `GET /countries` bỏ phân trang, đưa về cùng khuôn với `GET /units`/`GET /roles`:

- Response đổi từ bao `{ data: [...], pagination: {...} }` sang **mảng `CountryResDto` trần**. Client đang đọc `res.data`/`res.pagination` phải bỏ một lớp, đọc thẳng mảng.
- Query param `limit`, `page`, `order` không còn tác dụng — `ValidationPipe` (`whitelist: true`) âm thầm loại bỏ chúng khỏi request, không trả lỗi.
- Sắp xếp đổi từ `created_at DESC` sang `name` alphabet tăng dần.
