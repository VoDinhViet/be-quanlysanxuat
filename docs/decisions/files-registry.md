# Mọi file đi qua registry `files`, không phục vụ tĩnh

**Trạng thái:** còn hiệu lực · **Thay thế:** module `uploads` (đã xoá)

## Bối cảnh

Ban đầu có module `uploads` lưu file rồi trả về URL. Sáu schema cần đính kèm (`users`, `products`,
`boms`, `materials`, `suppliers`, `orders`) sẽ phải mỗi nơi tự giữ một cột URL trần, không ai biết
file nào còn được tham chiếu, không có metadata chung.

## Quyết định

1. **Một bảng `files` duy nhất.** Mọi đính kèm trỏ vào nó bằng `fileId` (hoặc `imageFileId`,
   `logoFileId`, `drawingFileId`, `avatarFileId`), **không bao giờ là URL trần**.
2. **Không `useStaticAssets` cho thư mục upload.** Static middleware đăng ký trên Express adapter
   thô, nên `JwtAuthGuard`/`PermissionsGuard` toàn cục **không bao giờ nhìn thấy** request đó —
   mount `uploads/` sẽ công khai toàn bộ file cho bất kỳ ai đoán được URL. Bytes chỉ đi ra qua
   `GET /files/:id/download`, sau URL ký.

## Hệ quả

- Thêm đính kèm cho một module mới = thêm cột `*FileId` + gọi `FilesService.linkFiles` **trước**
  transaction. Không tự lưu đường dẫn.
- Clone một bản ghi thì bản sao **trỏ chung dòng `files`** với bản gốc — đúng ý nghĩa registry,
  không nhân bản byte.
- **Ngoại lệ duy nhất toàn hệ thống: `countries.logoUrl`** — URL trần, vì cờ quốc gia là tài nguyên
  tĩnh của bên thứ ba, không phải file người dùng upload.

## Đừng đảo lại

Câu cảnh báo trong `src/main.ts` là chủ ý và có lý do bảo mật cụ thể. Đừng thêm lại
`useStaticAssets` cho thư mục upload, và đừng tạo lại module `uploads`.
