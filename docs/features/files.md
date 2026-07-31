# Tính năng: Files (Registry file dùng chung)

## Mục đích

Nguồn sự thật duy nhất cho mọi file đã upload — ảnh, tài liệu đính kèm. Mọi module có ảnh/tài liệu
(`products`, `materials`, `suppliers`, `orders`, `boms`, `users`) trỏ FK vào bảng `files` thay vì lưu
URL trần (ngoại lệ: `countries.logoUrl`, xem `master-data.md`).

## Quy tắc nghiệp vụ

- **Vòng đời 2 bước: upload rồi link.** `POST /files` đăng ký file vào registry, chưa gắn với thực
  thể nào (`linkedAt = null`). Module tiêu thụ (ví dụ `ProductsService`) gọi `FilesService.linkFiles`
  **trước khi mở transaction ghi entity** — đánh dấu `linkedAt` lần đầu file được dùng thật.
- **`linkFiles` chạy trước transaction có chủ đích, không phải sơ suất**: nếu bước ghi entity sau đó
  fail, file bị đánh dấu "đã link" nhưng không có gì trỏ tới nó — rác, nhưng vô hại. Đảo thứ tự
  (link sau khi ghi entity) mà crash giữa chừng sẽ để lại 1 dòng entity sống trỏ tới file **chưa**
  link, bị sweeper (`FilesCleanupService`) xoá sau — ảnh vỡ trên dữ liệu thật. Thà rác còn hơn mất
  dữ liệu.
- **`linkFiles` idempotent theo `id`** — gọi lại với file đã `linkedAt` không đổi gì (`isNull` trong
  `WHERE`, giữ ý nghĩa "lần đầu tiên được dùng"). File id không tồn tại → `E042`.
- **Upload không yêu cầu permission riêng** — bất kỳ user đã đăng nhập nào upload được mọi `type`.
  Chủ ý đơn giản hoá tạm thời (`UPLOAD_POLICIES` trong `upload-policy.ts` là chỗ bật permission theo
  từng `type` khi cần), không phải thiếu sót cần "sửa" bằng cách chép permission từ module khác.
- **`FileKind`** (`IMAGE`/`DOCUMENT`) quyết định mime family chấp nhận; **`UploadType`** (9 giá trị,
  ví dụ `PRODUCT_IMAGE`, `SUPPLIER_LOGO`, `BOM_ITEM_DRAWING`) ghi lại màn hình nào đã yêu cầu file —
  là khoá tra `UPLOAD_POLICIES` để suy ra `FileKind` tương ứng.
- **`GET /:fileId/download` dùng URL ký (signed), không dùng bearer token** — `@Public()` chủ ý:
  `<img src>` của trình duyệt không gắn được header `Authorization`, nên cặp `exp`/`sig` trong query
  string chính là credential, và `FileSignatureGuard` là nơi enforce nó. Gỡ guard này là để lộ toàn
  bộ file ra internet.
- **Xoá** chỉ người upload hoặc role có `system:manage` mới xoá được — xoá cả row registry lẫn byte
  vật lý.

## API contract

| Method | Path | Auth | Ghi chú |
| --- | --- | --- | --- |
| POST | `/files` | bearer | multipart upload, trả `FileResDto` |
| GET | `/files/:fileId` | bearer | metadata |
| GET | `/files/:fileId/download` | public (URL ký) | `FileSignatureGuard`, không phải bearer token |
| DELETE | `/files/:fileId` | bearer, chủ file hoặc `system:manage` | 204 |

## Trường hợp lỗi

| Trường hợp | ErrorCode |
| --- | --- |
| Một trong các `fileId` gửi lên (`linkFiles`) không tồn tại | `E042` |

## Ngoài phạm vi

- Resize/transform ảnh, CDN, versioning file.
- Permission theo từng `UploadType` — đã có khung (`UPLOAD_POLICIES`), chưa bật.

## Xem thêm

- `.claude/rules/dto.md` — `@FileField` decorator cho response DTO có quan hệ tới `files`.
- `docs/architecture.md` — vị trí `files` trong sơ đồ ER tổng.
