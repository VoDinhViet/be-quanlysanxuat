# Tính năng: Materials (Vật tư)

## Mục đích

Quản lý danh mục vật tư ("Vật tư") — nguyên vật liệu dùng làm leaf node (`MATERIAL`) trong cấu trúc sản phẩm (BOM). Mỗi vật tư thuộc một đơn vị tính (`units`, scope `MATERIAL`) và một nhóm vật tư (`material_groups`), có thể là vật tư nội bộ (`INTERNAL`) hoặc vật tư của khách hàng gia công (`CLIENT`, gắn với một `clients` cụ thể).

## Quy tắc nghiệp vụ

- **Không có xoá mềm.** Khác hầu hết module khác (`clients`, `suppliers`, `roles`, `operations`...), bảng `materials` **không có** cột `deletedAt`. Một vật tư chỉ ở trạng thái `ACTIVE` hoặc `INACTIVE` ("ngừng sử dụng") — việc "ngừng dùng" một vật tư đã có sẵn là `PATCH` với `status: INACTIVE`, không phải xoá. `DELETE /materials/:materialId` là **xoá cứng thật sự** (xem bên dưới).
- **`code` bất biến sau khi tạo.** `UpdateMaterialReqDto` cố ý không có trường `code` — đổi mã nghĩa là tạo vật tư mới. `code` tự sinh dạng `VTxxxx` nếu không truyền lên khi tạo (`E036` nếu mã truyền lên đã tồn tại).
- **`type` quyết định `clientId`.** `type = CLIENT` bắt buộc phải có `clientId` hợp lệ (`E040` nếu thiếu, `E009` nếu client không tồn tại); `type = INTERNAL` luôn xoá bỏ `clientId` dù client có truyền lên hay không. Khi `PATCH` chỉ gửi một trong hai trường (`type` hoặc `clientId`), cặp được kiểm lại theo giá trị **hiệu lực** — trường không gửi thì lấy giá trị hiện tại của vật tư, cùng cách `UsersService.updateUser` kiểm cặp (`departmentId`, `positionId`).
- **`unitId` phải thuộc scope `MATERIAL`.** Đơn vị tồn tại nhưng không được gán scope này → `E043` (khác `E011` là đơn vị không tồn tại).
- **`attachmentFileIds` là replace-all.** Gửi mảng mới (kể cả `[]`) thay hoàn toàn bộ tài liệu đính kèm cũ; không gửi trường này thì giữ nguyên. File phải được xác thực tồn tại và đánh dấu "đã liên kết" (`FilesService.linkFiles`) trước khi transaction ghi mở ra.
- **Xoá bị chặn khi vật tư đang được dùng trong BOM.** FK `bom_items.materialId` là `onDelete: 'restrict'` — DB tự chặn xoá cứng nếu còn node BOM nào tham chiếu. Service kiểm trước và trả `E041` (409) thay vì để lộ ra một lỗi 500 thô từ vi phạm khoá ngoại.
- **`PATCH` rỗng vẫn an toàn.** Payload luôn được spread kèm `updatedAt: new Date()`, nên `.set()` không bao giờ rỗng — kể cả một `PATCH` chỉ gửi `attachmentFileIds`.

## API contract

| Method | Path | Permission | Request | Response |
| ------ | ---- | ---------- | ------- | -------- |
| GET | `/materials` | `materials:read` | `GetMaterialsReqDto` — `limit`, `page`, `q`, `order`, `type`, `materialGroupId`, `clientId`, `status` | `200` + `MaterialResDto` phân trang |
| GET | `/materials/:materialId` | `materials:read` | — | `200` + `MaterialResDto` |
| POST | `/materials` | `materials:create` | `CreateMaterialReqDto` — `name`*, `unitId`*, `materialGroupId`*, `code`, `type`, `clientId`, `imageFileId`, `status`, `note`, thông tin mở rộng, `attachmentFileIds` | `201` + `MaterialResDto` |
| PATCH | `/materials/:materialId` | `materials:update` | `UpdateMaterialReqDto` — như trên trừ `code` (bất biến), tất cả tuỳ chọn | `200` + `MaterialResDto` |
| DELETE | `/materials/:materialId` | `materials:delete` | — | `204`, không có body |

(`*` = bắt buộc)

- `q` khớp mờ (`unaccent` ILIKE) `code`, `name`, và tên nhóm vật tư (`material_groups.name`).
- Danh sách sắp xếp **mới nhất trước** (`created_at DESC`).
- `MaterialResDto` gồm thông tin cơ bản (`code`, `name`, `type`, `status`, `unit`, `group`, `client`, `image`) và thông tin mở rộng tuỳ chọn (`materialGrade`, `technicalStandard`, `dimensions`, `specificWeight`, `colorSurface`, `description`, `origin`, `leadTime`) cùng `attachments` (chỉ có đầy đủ ở `GET .../:materialId` và ngay sau `POST`/`PATCH` — danh sách không load quan hệ này).
- Sau `POST`/`PATCH`, service đọc lại dòng vừa ghi bằng `getMaterialDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Không tìm thấy vật tư | `ErrorCode.E035` | 404 |
| `code` đã tồn tại (chỉ khi tạo, `code` truyền lên) | `ErrorCode.E036` | 409 |
| Đơn vị tính (`unitId`) không tồn tại | `ErrorCode.E011` | 404 |
| Đơn vị tính tồn tại nhưng không có scope `MATERIAL` | `ErrorCode.E043` | 400 |
| Nhóm vật tư (`materialGroupId`) không tồn tại | `ErrorCode.E037` | 404 |
| `type = CLIENT` nhưng không có `clientId` hiệu lực | `ErrorCode.E040` | 400 |
| Client (`clientId`) không tồn tại | `ErrorCode.E009` | 404 |
| Xoá vật tư đang được dùng trong ít nhất một node BOM | `ErrorCode.E041` | 409 |
| File đính kèm/ảnh không tồn tại trong registry | `ErrorCode.E042` | 404 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

Thứ tự kiểm khi `POST`: mã trùng (`E036`) → đơn vị tồn tại + đúng scope (`E011`/`E043`) → nhóm vật tư tồn tại (`E037`) → `type`/`clientId` hợp lệ (`E040`/`E009`) → file hợp lệ (`E042`). Khi `PATCH`: vật tư tồn tại (`E035`) → đơn vị (nếu gửi, `E011`/`E043`) → nhóm vật tư (nếu gửi, `E037`) → cặp `type`/`clientId` hiệu lực (nếu một trong hai được gửi, `E040`/`E009`) → file hợp lệ (`E042`). Khi `DELETE`: tồn tại (`E035`) → không bị dùng trong BOM (`E041`).

## Ngoài phạm vi

- **Tồn kho / nhập-xuất kho.** Chưa có bảng nào theo dõi số lượng tồn, phiếu nhập/xuất cho vật tư — module này chỉ là danh mục (master data), không phải quản lý kho.
- **Đơn giá.** Không có trường giá mua/giá vốn.
- `E041` (`material.has_transactions`) hiện chỉ kiểm tra "đang được tham chiếu trong `bom_items`" — tên gọi để ngỏ khả năng mở rộng sang một sổ cái tồn kho thật trong tương lai, khi đó ý nghĩa của mã lỗi này có thể rộng hơn.

## Xem thêm

- `material-groups`, `units` (scope `MATERIAL`) — dữ liệu tham chiếu bắt buộc khi tạo/sửa vật tư.
- `boms` — nơi vật tư được dùng làm leaf node (`MATERIAL`) trong cấu trúc sản phẩm; đây cũng là nguồn của việc chặn xoá (`E041`).
- `files` — registry lưu ảnh (`imageFileId`) và tài liệu đính kèm (`attachmentFileIds`).

## Frontend integration notes

**2026-07-25 — hoàn thiện CRUD.** Trước đây `materials` chỉ có `GET` (list) và `POST` (create). Nay có thêm:
- `GET /materials/:materialId` — chi tiết đầy đủ (kèm `attachments`, danh sách không có).
- `PATCH /materials/:materialId` — sửa. Không nhận `code`. `attachmentFileIds` là replace-all (gửi `[]` để xoá hết).
- `DELETE /materials/:materialId` — **xoá cứng** (không phải soft delete), trả `409` (`E041`) nếu vật tư đang được dùng trong một BOM.
