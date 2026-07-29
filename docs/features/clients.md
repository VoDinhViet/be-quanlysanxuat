# Tính năng: Clients (Khách hàng)

## Mục đích

Danh mục khách hàng — bên mua trên đơn hàng (`orders.clientId`). Mỗi client có thể có nhiều người liên hệ (`client_contacts`), thuộc một `client group`, và bị soft-delete thay vì xoá cứng.

## Quy tắc nghiệp vụ

- **Soft delete qua `deletedAt`.** Không có hàng nào bị xoá cứng — mọi truy vấn đọc (`getClients`, `getClientOptions`, `getClientDetail`, các hàm `ensure*`) đều lọc `isNull(clients.deletedAt)`.
- **`code`** và **`taxCode`** là duy nhất (loại trừ chính dòng đang sửa khi update).
- `clientGroupId` phải trỏ tới một `client group` tồn tại.
- `contacts` là bảng con `client_contacts`, ghi theo kiểu "thay toàn bộ": mỗi lần create/update kèm `contacts`, danh sách cũ bị xoá và chèn lại từ đầu (`ClientsService.replaceContacts`).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/clients` | public | `GetClientsReqDto` — `limit`, `page`, `q`, `order`, `status`, `clientGroupId` | `200` + `ClientResDto` phân trang |
| GET | `/clients/options` | public | `GetClientOptionsReqDto` — `q` | `200` + mảng `ClientOptionResDto` |
| GET | `/clients/:clientId` | public | — | `200` + `ClientResDto` |
| GET | `/clients/:clientId/contacts` | public | — | `200` + mảng `ClientContactResDto` |
| POST | `/clients` | JWT | `CreateClientReqDto` | `201` + `ClientResDto` |
| PATCH | `/clients/:clientId` | JWT | `UpdateClientReqDto` | `200` + `ClientResDto` |
| DELETE | `/clients/:clientId` | JWT | — | `204` |

### Chọn endpoint nào

- **`GET /clients`** — cho màn hình danh sách khách hàng: có phân trang, filter theo `status`/`clientGroupId`, `q` khớp mờ trên `code`/`name`/`taxCode`/`email`/`phoneNumber`/tên người liên hệ. Mỗi dòng trả đầy đủ `ClientResDto` kèm `group`, `contacts[]`, `creator`.
- **`GET /clients/options`** — cho dropdown chọn khách hàng (form đơn hàng, ...): trả danh mục (không phân trang), sắp xếp alphabet theo `name`, **giới hạn cứng 100 dòng** (`ClientsService.OPTIONS_LIMIT`) — khác `units`/`countries`/`roles` (danh mục nhỏ, tay-viết), `clients` tăng trưởng qua seed/import hàng loạt nên không thể trả "toàn bộ" vô điều kiện như các catalogue kia. `q` chỉ khớp mờ trên `code`/`name` — hẹp hơn `GET /clients` có chủ đích, vì DTO trả về không có `taxCode`/`email`/tên người liên hệ nên khớp trên các field đó sẽ trông như kết quả sai. Mỗi phần tử chỉ `{ id, code, name }`, không kèm `group`/`contacts`/`creator`. Nếu danh sách vượt quá 100 kết quả, client nên thu hẹp bằng `q` thay vì kỳ vọng có đủ toàn bộ.
- **`GET /clients/:clientId/contacts`** — khi chỉ cần danh sách người liên hệ của một khách hàng cụ thể (ví dụ để chọn `contactName`/`contactPhone`/`contactEmail` snapshot vào đơn hàng, xem `docs/features/orders.md`) mà không cần kéo theo toàn bộ `ClientResDto`. Trả mảng `ClientContactResDto`, sắp xếp **liên hệ chính (`isPrimary`) trước, còn lại theo thời gian tạo tăng dần**. 404 `E009` nếu `clientId` không tồn tại hoặc đã bị soft-delete.

## Trường hợp lỗi

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Client không tồn tại (hoặc đã soft-delete) | `E009` | 404 |
| `code` đã tồn tại | `E024` | 409 |
| `taxCode` đã tồn tại | `E025` | 409 |
| `clientGroupId` không khớp client group nào | `E026` | 404 |

## Ngoài phạm vi

- `GET /clients/options` không nhận `status`/`clientGroupId`, không phân trang, không trả `contacts` — cần những thứ đó thì dùng `GET /clients`.
- Xoá cứng — chỉ có soft delete.
