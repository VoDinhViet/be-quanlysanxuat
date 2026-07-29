# Tính năng: Operations (Công đoạn)

## Mục đích

Danh mục công đoạn sản xuất (cắt laser, hàn, sơn tĩnh điện, ...), phân loại `INHOUSE`/`OUTSOURCE`. Là dữ liệu nền cho `routing` (`GET/POST /products/:productId/operations`, ...) — mỗi bước routing trỏ tới một `operationId` trong danh mục này.

## Quy tắc nghiệp vụ

- **Chỉ-đọc qua HTTP kể từ 2026-07-28.** Trước đó module có đủ CRUD; create/update/delete đã bị gỡ bỏ — dữ liệu giờ chỉ nạp bằng seed (`src/database/seeds/operations.seed.ts`, idempotent theo `code`). Muốn thêm/sửa công đoạn thì sửa seed và chạy lại, không có route ghi.
- Cột `deletedAt` vẫn còn trên bảng (từ thời còn soft-delete qua API) và `GET /operations` vẫn lọc `isNull(deletedAt)`, nhưng không còn đường nào set nó nữa qua HTTP.
- `type` (`INHOUSE`/`OUTSOURCE`) và `status` (`ACTIVE`/`INACTIVE`) là filter, không phải quyền chỉnh sửa.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/operations` | public | `GetOperationsReqDto` — `q`, `type`, `status` | `200` + mảng `OperationResDto` |

- **Không phân trang** — giống `GET /units`/`GET /countries`/`GET /roles`, trả toàn bộ danh mục, sắp xếp alphabet theo `name`.
- Có giới hạn cứng `OperationsService.LIMIT = 100` (không phải phân trang thật, chỉ là chốt chặn phòng khi danh mục phình to ngoài dự kiến).
- `q` khớp mờ (`unaccent` ILIKE) trên `name`.

## Trường hợp lỗi

Không có ở module này. `E046` (`operation.error.not_found`) vẫn tồn tại trong `ErrorCode` nhưng throw site duy nhất giờ là `RoutingService` (khi một bước routing trỏ tới `operationId` không tồn tại) — không phải `OperationsService`. `E047` (`operation.error.code_exists`) không còn throw site nào, giữ reserved.

## Ngoài phạm vi

- Tạo/sửa/xoá công đoạn qua API — dùng seed script.
- Phân trang.

## Ghi chú tích hợp frontend (2026-07-28)

**Breaking change.** Gỡ bỏ hoàn toàn `GET /operations/:id`, `POST /operations`, `PATCH /operations/:id`, `DELETE /operations/:id`. Nếu có màn hình quản trị công đoạn đang gọi các route này, cần gỡ bỏ tương ứng ở frontend. `GET /operations` đổi response từ `{ data, pagination }` sang mảng trần. Permission code `operations:create`/`operations:update`/`operations:delete` không còn tồn tại trong `PERMISSION_CODES` — chỉ còn `operations:read`.
