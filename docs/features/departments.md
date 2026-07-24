# Tính năng: Departments (Phòng ban)

## Mục đích

Danh mục chỉ-đọc các phòng ban của công ty. Có hai nơi tiêu thụ: `users.departmentId` (nhân viên thuộc phòng ban nào) và `positions.departmentId` (mỗi chức vụ luôn nằm trong đúng một phòng ban). Là nguồn dữ liệu cho dropdown "Phòng ban" trên form nhân viên, và dropdown đó lại quyết định dropdown "Chức vụ" bên cạnh.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP.** Không có route tạo/sửa/xoá. Dữ liệu được seed — `pnpm db:seed:credentials` tạo sẵn các phòng ban mà tài khoản mặc định của nó cần, idempotent theo `code`.
- **`code` là duy nhất** trong toàn bảng (`varchar(50)`).
- **`description` có trong bảng nhưng không được expose** ra `DepartmentResDto` — nơi tiêu thụ là một dropdown.
- **Không xoá được phòng ban khi còn chức vụ trỏ tới, chặn ngay ở tầng DB** — `positions.departmentId` là `notNull` + `onDelete: restrict`. Hiện chưa có route xoá nên điều này chỉ ảnh hưởng tới SQL thao tác tay và tới màn hình quản trị trong tương lai.
- Hai quy tắc nằm ở phía tiêu thụ, đều trong `UsersService`, và không cái nào được kiểm ở đây:
  - `departmentId` không khớp dòng nào → `E014`;
  - `positionId` tồn tại nhưng không thuộc `departmentId` hiệu lực → `E064`. Đây chính là lý do hai dropdown bị ràng buộc với nhau: chọn phòng ban trước, rồi mới lọc chức vụ theo nó.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/departments` | public | `GetDepartmentsReqDto` — `limit`, `page`, `q`, `order` | `200` + `DepartmentResDto` phân trang |

- `GetDepartmentsReqDto` **không thêm filter nào** — chỉ là `PageOptionsDto` trần.
- `q` khớp mờ (`unaccent` ILIKE) cả `code` **và** `name`.
- Sắp xếp **mới nhất trước** (`created_at DESC`).
- `DepartmentResDto` là `{ id, code, name }` — không có `description`, không có timestamp.
- Có phân trang: đọc bao `{ data, pagination }`.

## Trường hợp lỗi

Không có. `DepartmentsService` chỉ có một method và không throw `AppException` nào. `E014` (`department.error.not_found`) được throw bởi `UsersService`, không phải ở đây.

## Ngoài phạm vi

- CRUD / màn hình quản trị.
- Cây phòng ban (cha/con), định biên nhân sự, hay tham chiếu trưởng phòng — mỗi dòng chỉ gồm mã + tên + mô tả.

## Xem thêm

- [`positions.md`](positions.md) — được lọc theo phòng ban; filter `departmentId` bên đó là nửa còn lại của luồng hai-dropdown-ràng-buộc.
- `users` — nơi tiêu thụ, và là nơi throw `E014`/`E064`. Chưa có doc; xem `src/api/users/`.
