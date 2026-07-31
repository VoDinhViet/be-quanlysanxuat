# Tính năng: Suppliers (Nhà cung cấp)

Bối cảnh nghiệp vụ, vòng đời và bất biến: `docs/domains/partners.md`. File này là chi tiết mức module: quy tắc cụ thể, ngữ nghĩa endpoint, error code.

## Mục đích

Hồ sơ nhà cung cấp: định danh, thông tin thanh toán/ngân hàng, người đại diện, tài liệu đính kèm. **Thuần master data** — không có phiếu mua hàng, không có nhận hàng theo đơn mua, không có công nợ.

## Quy tắc nghiệp vụ

- **`code` tự sinh** dạng `NCCxxxx` nếu không gửi (đếm toàn bảng + 1, pad 4 chữ số); gửi tay thì kiểm trùng (`E020`). Xem `partners.md` cho cảnh báo về khả năng trùng mã.
- **`taxCode` là duy nhất** (`E022`). Cả `code` lẫn `taxCode` đều kiểm trên **toàn bảng kể cả dòng đã xoá mềm**; khi update loại trừ chính nó.
- **Xoá mềm** — chỉ set `deletedAt`, không đụng bảng con.
- **FK kiểm khi gửi**: `supplierGroupId` → `E021`, `countryId` → `E023`.
- **`logoFileId` + `attachmentFileIds`** đi qua `FilesService.linkFiles` **trước** transaction (`E042` nếu id lạ). Upload type: `SUPPLIER_LOGO` / `SUPPLIER_DOCUMENT`.
- **`paymentTermEnum` khai báo tại module này**, `orders` import lại và dùng chung PG enum — đổi giá trị ảnh hưởng cả hai.
- **Tìm kiếm `q`**: unaccent ILIKE trên `code`, `name`, `taxCode`, **và** tên người đại diện (subquery).
- **Sắp xếp cố định `createdAt DESC`** — tham số `order` kế thừa từ `PageOptionsDto` bị bỏ qua.
- Không có CHECK constraint nào trên các bảng của module này. `rating` (0–5) chỉ được chặn ở DTO.

### Bảng con

| Bảng | Cardinality | Update |
| --- | --- | --- |
| `supplier_payment_info` | **1-1** (unique `supplierId`) | **merge từng phần**, luôn được tạo lúc create |
| `supplier_representatives` | 1-N | **replace-all** |
| `supplier_attachments` | 1-N | **replace-all** |

Tất cả `onDelete: cascade` — nhưng cascade là hành vi DB cho xoá cứng, còn API chỉ xoá mềm nên bảng con không bao giờ bị dọn.

## API contract

Bảng route/DTO đầy đủ: Swagger UI ở `/api-docs` (tự sinh từ `@ApiAuth`/`@ApiPublic`, luôn khớp code). Dưới đây chỉ ghi ngữ nghĩa không đọc được từ signature.

⚠️ **Ba route GET là `@ApiPublic()` — hoàn toàn không xác thực.** Decorator `@Permissions('suppliers:read')` trên chúng là metadata chết (chỉ hiện ở Swagger), vì cả hai guard `return true` trên route public. Xem `docs/domains/identity-access.md`.

- `CreateSupplierReqDto` **bắt buộc**: `name`, `supplierGroupId`, `type`, `taxCode`, `phoneNumber`, `address`. Tuỳ chọn: `code`, `email`, `note`, `logoFileId`, `countryId`, `payment` (mọi sub-field optional), `rating` (0–5), `status`, `internalNote`, `attachmentFileIds[]`, `representatives[]` (chỉ `name` bắt buộc).
- `SupplierResDto` lồng sẵn `group`, `country`, `payment`, `attachments[].file`, `representatives[]`, `creator`, và `logo` — lưu ý **request gửi `logoFileId`, response trả về `logo`**.
- Enum: `SupplierStatus` (`ACTIVE`/`PAUSED`/`STOPPED`), `SupplierType` (`INDIVIDUAL`/`COMPANY`/`HOUSEHOLD`), `PaymentMethod`, `PaymentTerm` (`IMMEDIATE`/`NET_15`/`NET_30`/`NET_60`).

### `GET /suppliers/stats`

Một câu `GROUP BY status` trên các dòng chưa xoá mềm. Trả `{ total, active, paused, stopped }` — `total` là tổng các nhóm (nên **không** tính dòng đã xoá mềm), mỗi field còn lại là count của status đó, `0` nếu không có dòng nào.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| --- | --- | --- |
| Không tìm thấy NCC (hoặc đã xoá mềm) | `ErrorCode.E019` | 404 |
| `code` đã tồn tại | `ErrorCode.E020` | 409 |
| Nhóm NCC không tồn tại | `ErrorCode.E021` | 404 |
| `taxCode` đã tồn tại | `ErrorCode.E022` | 409 |
| Quốc gia không tồn tại | `ErrorCode.E023` | 404 |
| File đính kèm/logo không có trong registry | `ErrorCode.E042` | 404 |
| Role của caller thiếu quyền (chỉ các route ghi) | `ErrorCode.E033` | 403 |

`E019` cũng được `MaterialsService` ném khi validate `supplierId`. Không có mã supplier nào ở trạng thái reserved-chưa-dùng.

## Ngoài phạm vi

Phiếu mua hàng / nhận hàng theo đơn mua · bảng giá theo NCC · công nợ (`creditLimit` chỉ được lưu, chưa nơi nào đọc) · lịch sử đánh giá (`rating` là số nhập tay) · khôi phục bản ghi đã xoá · import/export hàng loạt · endpoint liệt kê vật tư theo NCC · CRUD nhóm NCC (thuộc module riêng).

## Xem thêm

- `docs/domains/partners.md` — bất biến, cảnh báo xoá mềm, quan hệ với các domain khác.
- `docs/features/master-data.md` — nhóm NCC và quốc gia.
- `docs/features/materials.md` — nơi tiêu thụ `supplierId`.
