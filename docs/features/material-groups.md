# Tính năng: Material Groups (Nhóm vật tư)

## Mục đích

Danh mục chỉ-đọc dùng để phân loại vật tư (`materials.materialGroupId`). Là nguồn dữ liệu cho dropdown "Nhóm vật tư" trên form vật tư.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá — dữ liệu được seed hoặc insert trực tiếp.
- **Đây là danh mục chỉ-đọc duy nhất trong sáu danh mục master-data yêu cầu xác thực.** Nó dùng `@ApiAuth` + `@Permissions('materials:read')`, trong khi `countries`, `client-groups`, `supplier-groups`, `departments` và `positions` đều là `@ApiPublic()`. Sự bất đối xứng này là thật và ảnh hưởng trực tiếp tới client: một caller có token nhưng *không* có `materials:read` sẽ nhận **403 `E033`** ở đây và `200` ở năm cái kia. Không có gì trong bản chất dữ liệu biện minh cho khác biệt này — nó bám theo permission của module tiêu thụ nó.
- **`code` là duy nhất** trong toàn bảng (`varchar(50)`).
- **`description` *có* được expose ở đây**, khác với `ClientGroupResDto`/`SupplierGroupResDto`, và cả `createdAt`/`updatedAt` cũng vậy. Lại một bất đối xứng nữa giữa các bảng vốn cùng hình dạng — đừng "chuẩn hoá" cái này cho giống cái kia mà chưa kiểm tra màn hình nào đang đọc chúng.
- Quy tắc ràng buộc nằm ở phía tiêu thụ: `MaterialsService` từ chối `materialGroupId` không khớp dòng nào với `E037`. Bản thân module này không bao giờ throw.
- **`E038` (`material_group.error.code_exists`) và `E039` (`material_group.error.in_use`) được giữ chỗ nhưng chưa dùng** — chúng được viết cho phần CRUD nhóm vật tư chưa làm. Giữ nguyên ý nghĩa của chúng nếu sau này CRUD đó ra đời.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/material-groups` | `materials:read` | `GetMaterialGroupsReqDto` — `limit`, `page`, `q`, `order` | `200` + `MaterialGroupResDto` phân trang |

- `GetMaterialGroupsReqDto` **không thêm filter nào** — chỉ là `PageOptionsDto` trần.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `MaterialGroupResDto` là `{ id, code, name, description, createdAt, updatedAt }`. `description` nullable.
- Có phân trang: đọc bao `{ data, pagination }`.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Role của caller không có `materials:read` | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

Bản thân `MaterialGroupsService` không throw gì; cả hai dòng trên đến từ guard toàn cục (`JwtAuthGuard`, rồi `PermissionsGuard`).

## Ngoài phạm vi

- CRUD / màn hình quản trị — `E038`/`E039` giữ chỗ là dấu hiệu cho phần này.
- Nhóm lồng nhau / phân cấp.

## Xem thêm

- `materials` — nơi tiêu thụ, và là nơi throw `E037`. Chưa có doc; xem `src/api/materials/`.
- [`client-groups.md`](client-groups.md), [`supplier-groups.md`](supplier-groups.md) — cùng hình dạng bảng, nhưng public và DTO response hẹp hơn.
