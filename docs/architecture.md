# Kiến trúc

Modular monolith NestJS 11, Postgres qua Drizzle (postgres.js), Redis cho cache và hàng đợi. Mỗi domain là một thư mục `src/api/<domain>/` gồm `*.module.ts`, `*.controller.ts`, `*.service.ts` và `dto/`. Code dùng chung nằm ở `src/common`, `src/decorators`, `src/constants`, `src/filters`, `src/exceptions`, `src/database`, `src/redis`, `src/storage`, `src/templates`, `src/utils`.

## Vòng đời một request

Cấu hình trong `src/main.ts` và `src/app.module.ts`:

1. `helmet`, `compression`, CORS theo `app.corsOrigin` (có credentials).
2. Tiền tố toàn cục `/api`, trừ `GET /` và `GET /health`. Bật versioning kiểu URI.
3. `JwtAuthGuard` (global): lấy `Authorization: Bearer <token>`, xác thực chữ ký, kiểm tra session có nằm trong blacklist Redis không. Route gắn `@Public()` bỏ qua bước này.
4. `PermissionsGuard` (global): đọc `@Permissions(...)` của route, nạp quyền của người dùng, so khớp. Chi tiết ở [identity-access.md](domains/identity-access.md).
5. `ValidationPipe` với `transform` và `whitelist`; lỗi validation trả **422**, không phải 400.
6. Controller → service. Chỉ controller kiểm tra quyền; service không kiểm tra.
7. `ClassSerializerInterceptor` áp dụng các `@Exclude/@Expose` của response DTO.
8. Mọi lỗi đi qua `GlobalExceptionFilter`.

Swagger ở `/api-docs`, chỉ bật khi `NODE_ENV` khác `production`.

File `main.ts` cũng export một `handler` để chạy dạng serverless; khi đó `ScheduleModule` (job dọn file) không chạy vì chỉ có timer trong bộ nhớ.

## Định dạng lỗi

`AppException(errorCode, status, message?)` ném lỗi nghiệp vụ. Filter trả về:

```json
{ "timestamp": "...", "statusCode": 409, "error": "Conflict", "errorCode": "department.error.in_use", "message": "..." }
```

Lỗi validation có thêm `details: [{ property, code, message }]` và `message: "Validation failed"`. Mã lỗi nghiệp vụ là enum `ErrorCode` trong `src/constants/error-code.constant.ts`, đánh số `E001`… ; giá trị thật là chuỗi dạng `<domain>.error.<tên>` để frontend map thông báo. Số bị bỏ không dùng lại: file có comment "reserved" cho các mã đã nghỉ hưu.

Filter còn chuyển lỗi Postgres (`extractPostgresError`) thành lỗi HTTP, và che đường dẫn đĩa trong lỗi static file. Trên production không in debug.

## Dữ liệu

- Schema Drizzle chia theo domain trong `src/database/schemas/` (`identity-access`, `clients`, `items`, `suppliers`, `orders`, `inventory`, `quality`, `production`, `purchase-requests`, `purchasing` và vài file lẻ), re-export qua `index.ts`. Service lấy DB qua token `DRIZZLE`.
- Xoá mềm bằng cột `deletedAt` ở các bảng có cột này; mọi truy vấn phải tự lọc.
- Enum là TypeScript enum xuất từ file schema, phản chiếu thành `pgEnum`. Đổi giá trị enum cần migration, và index một phần nhắc giá trị cũ phải viết lại.
- Migration trong `drizzle/` (hiện 215 file), kiểm tra lệch bằng `pnpm db:check-drift`.
- Cột `date` so sánh theo UTC nửa đêm; "hôm nay" theo nghiệp vụ là giờ Việt Nam (`src/database/vn-date.util.ts`).

### Mã chứng từ tự sinh

Bảng `document_sequences` giữ bộ đếm cho `(documentType, year)`; `year = 0` nghĩa là không đánh số theo năm. `generateDocumentSequence(tx, type, year)` trong `src/common/utils/document-sequence.util.ts` là đường ghi duy nhất, chạy bằng một câu `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.

- Bắt buộc gọi trong transaction đang mở của chính lượt tạo chứng từ. Dòng đếm bị khoá đến khi transaction kết thúc, nên hai request cùng loại đợi nhau.
- Rollback thì số đó được trả lại, khác với sequence của Postgres.
- `generateDocumentSequences` cấp một cụm số liên tiếp trong một câu (dùng cho IQC).
- Các loại hiện có (`DocumentType`): ITEM_DIRECT, ITEM_FG, PURCHASE_REQUEST, OQC, IQC, INVENTORY_RECEIPT, INVENTORY_ISSUE, INVENTORY_ADJUSTMENT, INVENTORY_REQUISITION, PURCHASE_QUOTATION, PURCHASE_ORDER, OUTSOURCING_ORDER, OUTSOURCING_RECEIPT, USER, SUPPLIER, ORDER, PRODUCTION_ORDER, PRODUCTION_JOB, OUTBOUND_ORDER, SUPPLIER_RETURN, PAYMENT_REQUEST, UNIT, OPERATION.
- Trong danh sách trên, `ITEM_DIRECT`, `SUPPLIER`, `UNIT` và `OPERATION` hiện **không có nơi nào gọi** (mã vật tư, nhà cung cấp, đơn vị và công đoạn do người dùng tự đặt).
- Định dạng chuỗi mã do từng service tự ghép (ví dụ nhân sự `NV0001`, thành phẩm `SP0001`), nên xem trong doc của domain tương ứng.

### Transaction

Kiểm tra chỉ đọc (tồn tại, trùng mã, quyền) chạy **trước** khi mở transaction; transaction chỉ chứa phần ghi. Service nhận `db: Database | DbTransaction` khi cần chạy được cả trong transaction của nơi gọi.

## Redis, cache và hàng đợi

`RedisModule` (global) dựng cache Keyv/Redis (TTL mặc định 7 ngày) và BullMQ từ một `REDIS_URL`. Hiện cache dùng cho session đăng nhập: `session_hash:<sessionId>` và `session_blacklist:<sessionId>` (`src/constants/cache.constant.ts`).

## Tệp tải lên

`StorageModule` có provider lưu đĩa cục bộ (`UPLOAD_DRIVER=local`, thư mục `uploads/`). `ServeStaticModule` phục vụ thư mục này ở gốc domain, không xác thực, không ký. Khoá lưu trữ chính là đường dẫn công khai dạng `<năm>/<tháng>/<ngày>/<uuid>.<ext>`, nên không đụng route `/api`. Bảng `files` là registry; các domain gắn file qua `FilesService.linkFiles`, và `FilesCleanupService` (theo lịch) dọn file mồ côi.

### Registry và API tệp (`/files`)

`files` là registry duy nhất cho mọi tệp tải lên. Các bảng khác chỉ giữ `fileId` (cột như `imageFileId`, `avatarFileId`) hoặc bảng nối (`item_files`, `supplier_files`...), không lưu lại url hay tên tệp.

| Route | Quyền | Ghi chú |
|---|---|---|
| `POST /files?type=<UploadType>` | đăng nhập | `multipart/form-data`, trường `file`. Trả `201` kèm metadata. Chưa gắn vào đối tượng nào. |
| `GET /files/:fileId` | đăng nhập | Metadata. `E042` nếu không thấy. |
| `DELETE /files/:fileId` | đăng nhập | Chỉ **người tải lên** hoặc `system:manage` (`E033` nếu không). File đang là bằng chứng QC thì bị chặn. |

Quy tắc tải lên:

1. `type` (`UploadType`) đi theo query, không theo body. `kind` (`IMAGE`/`DOCUMENT`/`EVIDENCE`) do server suy ra từ `uploadPolicies`, **không bao giờ lấy từ client**, để không dùng loại `USER_AVATAR` rồi lách bằng PDF.
2. Dung lượng tối đa: ảnh 5 MB (`UPLOAD_MAX_IMAGE_SIZE`), tài liệu và bằng chứng 10 MB (`UPLOAD_MAX_DOCUMENT_SIZE`). Quá cỡ: `E017` (413).
3. Loại tệp xác định bằng **byte thật** (`file-type`), không tin mimetype client khai. Sai loại hoặc không nhận diện được: `E016` (400).
   - `IMAGE`: jpeg, png, webp, gif.
   - `DOCUMENT`: PDF, RTF, EPUB, Office OOXML (docx, xlsx, pptx và template), OpenDocument, DWG, Visio, iWork, và các tệp nén (zip, rar, 7z, tar, gzip, bzip2). Cố ý **không nhận** Office nhị phân cũ (.doc, .xls, .ppt) và tệp có macro (.docm, .xlsm, .pptm).
   - `EVIDENCE`: hợp của hai tập trên.
4. Khoá lưu trữ dạng `<năm>/<tháng>/<ngày>/<uuid>.<ext>`, kèm SHA-256 `checksum`. `url` dựng từ khoá lưu trữ và là liên kết công khai vĩnh viễn (xem `architecture.md`).
5. **Hiện không kiểm quyền theo loại tệp**: người đăng nhập nào cũng tải lên được mọi `UploadType`. Đây là chủ ý, có ghi trong `upload-policy.ts`.

Vòng đời liên kết:

- Service dùng tệp phải gọi `FilesService.linkFiles(fileIds)` **trước** khi ghi `*FileId` và trước khi mở transaction. Hàm kiểm tra tệp tồn tại (`E042`) rồi đánh dấu `linkedAt` (chỉ lần đầu).
- `FilesCleanupService` chạy mỗi giờ (`@Cron EVERY_HOUR`), xoá các tệp có `linkedAt IS NULL` và cũ hơn `UPLOAD_ORPHAN_TTL` (mặc định 24 giờ). Xoá byte trước rồi mới xoá dòng: dòng trỏ nhầm byte đã mất thì lần quét sau xử lý lại được, còn byte không có dòng thì không bao giờ tìm lại.
- Quét theo `linkedAt` chứ không dò ngược các bảng tham chiếu, nên thêm module mới mà quên khai báo thì **không** làm mất dữ liệu thật.
- Job chỉ chạy khi app là tiến trình chạy lâu dài; ở chế độ serverless (`handler` của `main.ts`) timer trong bộ nhớ không bao giờ kích hoạt và chưa có bộ lập lịch ngoài thay thế.

Loại tệp đã nghỉ hưu, vẫn giữ giá trị trong enum, không dùng lại: `PRODUCT_DOCUMENT` (thay bằng `ITEM_DOCUMENT`), `BOM_ITEM_DRAWING` (cột `bom_items.drawing_file_id` đã bỏ ở migration 0185).

## Mẫu in và xuất file

`src/templates/` chứa mẫu HTML (đơn hàng, tổng hợp đơn, lệnh sản xuất, kế hoạch sản xuất, phiếu nhập kho) và `PdfRendererService` dựng PDF bằng puppeteer (gói chỉ có ESM, nên spec phải `jest.mock` service này). Xuất Excel dùng `src/common/utils/excel.util.ts`.

## Bản đồ module

| Khu vực | Module trong `src/api` |
|---|---|
| Nhận dạng và phân quyền | auth, users, roles, departments, positions |
| Dữ liệu gốc | clients, client-groups, suppliers, supplier-groups, items, item-units, units, countries, files, operations, routings, boms, bom-operations, bom-directs |
| Bán hàng | orders, outbound-orders |
| Sản xuất | production-orders, production-jobs, production-execution |
| Mua hàng | purchase-requests, purchase-quotations, purchase-orders, purchase-notes, purchase-ledger, payment-requests |
| Kho | inventory, inventory-receipts, inventory-issues, inventory-requisitions, inventory-adjustments, inventory-directs, inventory-products, supplier-returns |
| Chất lượng | iqc, oqc |
| Gia công ngoài | outsourcing-orders, outsourcing-receipts |
| Báo cáo và hạ tầng | reports, health |

Phụ thuộc chéo đáng nhớ (xác nhận trong code): `production-jobs` gọi `purchase-requests` để sinh đề xuất mua khi xác nhận Job, và gọi `inventory-directs` để tính tồn khả dụng; `users` gọi `files` để gắn ảnh đại diện. Luồng nhiều module sẽ được mô tả ở doc của khu vực sở hữu bước đầu tiên.
