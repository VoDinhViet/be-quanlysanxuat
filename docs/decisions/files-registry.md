# Mọi file đi qua registry `files`, bytes phục vụ tĩnh công khai

**Trạng thái:** còn hiệu lực · **Thay thế:** module `uploads` (đã xoá); URL ký HMAC + hết hạn (đã bỏ)

## Bối cảnh

Ban đầu có module `uploads` lưu file rồi trả về URL. Sáu schema cần đính kèm (`users`, `products`,
`boms`, `materials`, `suppliers`, `orders`) sẽ phải mỗi nơi tự giữ một cột URL trần, không ai biết
file nào còn được tham chiếu, không có metadata chung.

Giai đoạn kế tiếp từng dùng URL ký HMAC-SHA256 + hết hạn (1h) phục vụ qua `GET /files/:id/download`
— đã bỏ, xem "Lịch sử" bên dưới.

## Quyết định

1. **Một bảng `files` duy nhất.** Mọi đính kèm trỏ vào nó bằng `fileId` (hoặc `imageFileId`,
   `logoFileId`, `drawingFileId`, `avatarFileId`), **không bao giờ là URL trần**.
2. **Bytes phục vụ tĩnh, công khai, vĩnh viễn.** `ServeStaticModule` (`app.module.ts`) serve thẳng
   `upload.dir` ở domain root — `FileResDto.url` = `/<storageKey>` (vd
   `/2026/07/20/<uuid>.png`), không qua controller, không auth, không ký, không hết hạn. Ranh giới
   bảo vệ duy nhất là storage key khó đoán (chứa UUID) — ai cầm được link thì đọc được mãi mãi, kể
   cả sau khi link lộ ra qua log/cache/chia sẻ. Đây là trade-off có chủ đích, chọn vì đơn giản.

## Hệ quả

- Thêm đính kèm cho một module mới = thêm cột `*FileId` + gọi `FilesService.linkFiles` **trước**
  transaction. Không tự lưu đường dẫn.
- Clone một bản ghi thì bản sao **trỏ chung dòng `files`** với bản gốc — đúng ý nghĩa registry,
  không nhân bản byte.
- `DELETE /files/:id` vẫn là đường xoá byte duy nhất (registry + `storageProvider.delete`) — xoá
  xong thì static route tự 404, không có cơ chế nào khác giữ byte sống lại.
- **Ngoại lệ duy nhất toàn hệ thống: `countries.logoUrl`** — URL trần, vì cờ quốc gia là tài nguyên
  tĩnh của bên thứ ba, không phải file người dùng upload.

## Lịch sử

- **URL ký HMAC + hết hạn 1h** (`GET /files/:id/download`, `FileSignatureGuard`) — bỏ vì gây 11+
  chỗ FE phải tự viết code fallback "ảnh vỡ khi hết hạn" (tình trạng hết hạn là thật: nhiều query
  không set `staleTime`, avatar phiên chỉ fetch 1 lần). Đổi hẳn sang public vĩnh viễn để bỏ toàn bộ
  tầng ký/verify/TTL — không phải bỏ sót.
- **Không `useStaticAssets`** — từng là quyết định ở đây, nay **đảo ngược**: đổi hẳn sang
  `ServeStaticModule` phục vụ trực tiếp, không qua `GET /files/:id/download` nữa (route đó đã xoá
  cùng `FilesService.streamFile`). Đánh đổi: tải tài liệu (PDF/DOCX/XLSX) không còn giữ được tên
  file gốc tiếng Việt (`Content-Disposition` tự set trước đây), chỉ còn tên storage key thô — chấp
  nhận được vì ưu tiên đơn giản.
