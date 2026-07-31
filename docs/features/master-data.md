# Tính năng: Master Data (Danh mục dùng chung)

Bối cảnh nghiệp vụ, vòng đời và bất biến: `docs/domains/partners.md`. File này là chi tiết mức module: quy tắc cụ thể, ngữ nghĩa endpoint, error code.

Bảy danh mục chỉ-đọc, mỗi cái tồn tại để một module nghiệp vụ khác trỏ FK vào và có dữ liệu cho một
dropdown. Gộp vào một file vì cùng hình dạng: không CRUD qua HTTP, `code` unique, `q` khớp mờ
(`unaccent` ILIKE) trên `code`+`name`, và mọi ràng buộc FK được kiểm ở **phía tiêu thụ** (module
dùng nó), không phải ở chính module danh mục — bản thân các service dưới đây gần như không bao giờ
throw `AppException`. Chỉ liệt kê bên dưới những gì **riêng** của từng danh mục.

## Client Groups

`clients.clientGroupId` (nullable). `GET /client-groups` — public, phân trang, `description` **không**
expose ra `ClientGroupResDto` (chỉ `{ id, code, name }`). `ClientsService` từ chối `clientGroupId` lạ
với `E026`.

## Supplier Groups

`suppliers.supplierGroupId`. `GET /supplier-groups` — public, phân trang, `description` không expose
(cùng hình dạng Client Groups). `SuppliersService` từ chối `supplierGroupId` lạ với `E021`.

## Material Groups

`materials.materialGroupId`. `GET /material-groups` — **yêu cầu `materials:read`** (khác 5 danh mục
còn lại đều public — caller có token nhưng thiếu quyền này nhận 403 `E033`, không phải 200). Response
**có** expose `description` + `createdAt`/`updatedAt` — khác Client/Supplier Groups. `MaterialsService`
từ chối `materialGroupId` lạ với `E037`. `E038`/`E039` (code trùng/đang dùng) reserved cho một CRUD
chưa xây, chưa có throw site.

## Countries

`suppliers.countryId`. `GET /countries` — public, **không phân trang** (mảng trần), sort alphabet theo
`name`. `logoUrl` là **URL trần, không qua registry `files`** — cờ quốc gia là tài nguyên tĩnh, không
phải file người dùng upload. `SuppliersService` từ chối `countryId` lạ với `E023`.

## Departments

`users.departmentId`, `positions.departmentId`. `GET /departments` — public, phân trang, `description`
không expose. `positions.departmentId` là `notNull` + `onDelete: restrict` — không xoá được phòng ban
khi còn chức vụ trỏ tới (dù hiện chưa có route xoá). `UsersService` từ chối `departmentId` lạ với
`E014`.

## Positions

`users.positionId`. `GET /positions` — public, phân trang, filter thêm `departmentId` (bỏ trống = trả
mọi chức vụ). `code` **unique toàn hệ thống**, không phải theo từng phòng ban. `description` không
expose; response **có** kèm `department` đầy đủ (`{ id, code, name }`, qua `with: { department: true
}`). Cặp phòng ban/chức vụ được **kiểm khi ghi** ở `UsersService`, không chỉ lọc ở dropdown — gửi
`positionId` không khớp `departmentId` hiệu lực của nhân viên bị từ chối với `E064`; `positionId`
không tồn tại là `E015`.

## Operations (Công đoạn)

`routing_steps.operationId`. `GET /operations` — public, không phân trang (mảng trần, giới hạn cứng
`OperationsService.LIMIT = 100`), filter `type` (`INHOUSE`/`OUTSOURCE`) + `status`. **Chỉ-đọc từ
2026-07-28** — từng có CRUD đầy đủ, đã gỡ; thêm/sửa công đoạn giờ qua sửa
`src/database/seeds/operations.seed.ts` rồi chạy lại, không có route ghi. `RoutingService` từ chối
`operationId` lạ với `E046`.

## Ngoài phạm vi (cả bảy)

- CRUD / màn hình quản trị (trừ Operations, đã có rồi bị gỡ — xem ghi chú riêng).
- Nhóm lồng nhau / phân cấp.
- Bất kỳ đơn vị hành chính, khung lương, hay tuyến báo cáo nào.

## Xem thêm

- Module tiêu thụ tương ứng: `clients`, `suppliers`, `materials`, `users`, `routing`.
- `docs/architecture.md` — vị trí các danh mục này trong sơ đồ ER tổng.
