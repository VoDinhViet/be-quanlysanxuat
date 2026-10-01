# Dữ liệu gốc

Phạm vi: `src/api/` các thư mục `clients`, `client-groups`, `suppliers`, `supplier-groups`, `countries`, `units`, `items`, `item-units`, `boms`, `bom-operations`, `bom-directs`, `routings`, `operations`, `files`. Schema tương ứng ở `src/database/schemas/{clients,suppliers,units,items}/`, `operations.ts`, `countries.ts`, `files.ts`.

Đây là nhóm danh mục mà các domain khác (đơn hàng, sản xuất, mua hàng, kho) tham chiếu. Điểm chung:

- Mã (`code`) do người dùng tự đặt, trừ thành phẩm (FG) tự sinh `SPxxxx` khi bỏ trống. Các giá trị `ITEM_DIRECT`, `SUPPLIER`, `UNIT`, `OPERATION` có trong enum `DocumentType` nhưng **không có nơi nào dùng**.
- Xoá mềm bằng `deletedAt` (clients, suppliers, items, operations). Khoá ngoại tới các bảng chứng từ là `restrict`, nhưng xoá mềm không kích hoạt `restrict`, nên mỗi service tự kiểm "đang được dùng" trước khi xoá và trả mã `*.error.in_use` (409). Các phép kiểm này cố ý **không** lọc `deletedAt` của bảng chứng từ, vì dòng đã xoá mềm vẫn giữ khoá ngoại.
- Create/update phần lớn trả 204 (không có body).
- Tìm kiếm dùng `unaccentILike` (không phân biệt dấu, hoa thường).

## Khách hàng (`/clients`) và nhóm khách hàng

| Bảng | Ghi chú |
|---|---|
| `clients` | `code` (unique chỉ trong các dòng chưa xoá, `uq_clients_code_active`), `name`, `clientGroupId` bắt buộc, `taxCode`, `phoneNumber`, `email`, `address`, `note`, `status` `ACTIVE`/`PAUSED`. |
| `client_contacts` | Người liên hệ, nhiều dòng mỗi khách hàng: `name`, `position`, `phoneNumber`, `email`, `note`, `isPrimary`. |
| `client_groups` | Nhóm khách hàng: `code` unique, `name`, `description`. Chỉ có route đọc. |

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /clients` | `clients:read` | Phân trang. Tìm theo mã, tên, MST, email, SĐT và tên người liên hệ; lọc `status`, `clientGroupId`. |
| `GET /clients/options` | `clients:read` | Cho select box: chỉ tìm theo mã và tên, sắp theo tên, **tối đa 100 dòng**. |
| `GET /clients/:clientId` | `clients:read` | Chi tiết. `E009` nếu không thấy. |
| `GET /clients/:clientId/contacts` | `clients:read` | Danh sách người liên hệ. |
| `POST /clients` | `clients:create` | Kiểm mã (`E024`), MST (`E025`), nhóm tồn tại (`E026`). Ghi client rồi ghi contacts. |
| `PATCH /clients/:clientId` | `clients:update` | Gửi `contacts` thì **thay toàn bộ** danh sách (xoá hết rồi chèn lại); không gửi thì giữ nguyên. |
| `DELETE /clients/:clientId` | `clients:delete` | Xoá mềm. Còn đơn hàng (`orders`) hoặc phiếu giao (`outbound_orders`) trỏ tới thì `E246`. |
| `GET /client-groups` | công khai | Danh sách nhóm. |

Create/update client ghi `clients` rồi mới ghi `contacts` ở lệnh riêng, **không bọc trong transaction**; lỗi giữa chừng có thể để lại client không có contacts.

## Nhà cung cấp (`/suppliers`) và nhóm nhà cung cấp, quốc gia

| Bảng | Ghi chú |
|---|---|
| `suppliers` | `code` unique (không phân biệt xoá mềm), `name`, `supplierGroupId`, `countryId`, `type` `INDIVIDUAL`/`COMPANY`/`HOUSEHOLD`, `taxCode` unique, `address` bắt buộc, `rating`, `status` `ACTIVE`/`PAUSED`/`STOPPED`, `logoFileId`, `internalNote`. |
| `supplier_payment_info` | 1-1 với supplier, **luôn tạo cùng lúc** với supplier: ngân hàng, số tài khoản, phương thức thanh toán mặc định (`CASH`/`BANK_TRANSFER`), kỳ hạn mặc định (`IMMEDIATE`/`NET_15`/`NET_30`/`NET_60`), hạn mức công nợ (VND, không âm) và ngày bắt đầu hạn mức. |
| `supplier_representatives` | Người đại diện, nhiều dòng: `name`, `phoneNumber`, `isPrimary`. |
| `supplier_files` | Tệp đính kèm, liên kết sang bảng `files`. |
| `supplier_groups`, `countries` | Danh mục nhỏ chỉ có route đọc. |

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /suppliers` | `suppliers:read` | Phân trang, có bộ lọc. |
| `GET /suppliers/stats` | `suppliers:read` | Số nhà cung cấp theo trạng thái: tổng, `active`, `paused`, `stopped`. |
| `GET /suppliers/:supplierId` | `suppliers:read` | Chi tiết kèm thanh toán, đại diện, tệp. |
| `POST /suppliers` | `suppliers:create` | Trả về chi tiết (khác clients). Trong **một transaction**: ghi supplier, `supplier_payment_info`, tệp, đại diện. |
| `PATCH /suppliers/:supplierId` | `suppliers:update` | Trả về chi tiết. `payment` chỉ ghi đè các trường gửi lên; `fileIds` và `representatives` nếu gửi thì thay toàn bộ. |
| `DELETE /suppliers/:supplierId` | `suppliers:delete` | Xoá mềm. Còn dữ liệu trong `purchase_orders`, `purchase_quotation_item_suppliers`, `outsourcing_orders`, `outsourcing_receipts` hoặc `supplier_returns` thì `E247`. |
| `GET /supplier-groups`, `GET /countries` | công khai | Danh sách nhóm / quốc gia. |

Mã lỗi: `E019` không thấy NCC, `E020` mã trùng, `E021` nhóm không có, `E022` MST trùng, `E023` quốc gia không có.

## Đơn vị tính (`/units`) và quy đổi (`/items/:itemId/units`)

`units` là danh mục ĐVT dùng chung: `code` unique, `name`, `type` (`QUANTITY`/`WEIGHT`/`LENGTH`/`VOLUME`, chỉ để phân loại và lọc, **không** dùng để quy đổi), `status`.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /units`, `GET /units/:unitId` | **công khai** (không cần đăng nhập) | Không phân trang, sắp theo tên, lọc `q`, `type`, `status`. |
| `POST /units` | `items:create` | Mã trùng `E241`. |
| `PATCH /units/:unitId` | `items:update` | |
| `DELETE /units/:unitId` | `items:update` | Xoá cứng. Còn `items` hoặc `production_job_units` dùng thì `E242` (kiểm cả item đã xoá mềm vì vẫn giữ khoá ngoại). |

`item_units` là đơn vị phụ của một item kèm hệ số quy đổi ra đơn vị gốc (`items.unitId`, hệ số 1 ngầm định, không có dòng riêng). Mỗi cặp (item, unit) duy nhất, hệ số > 0. Dòng phiếu kho **chụp lại** hệ số lúc lập phiếu, không đọc lại giá trị mới nhất.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /items/:itemId/units` | `items:read` | |
| `POST /items/:itemId/units` | `items:update` | Trùng đơn vị đã có, hoặc trùng với đơn vị gốc của item: `E263`. |
| `PATCH /items/:itemId/units/:unitId` | `items:update` | Không có dòng: `E262`. |
| `DELETE /items/:itemId/units/:unitId` | `items:update` | Xoá cứng, không cần kiểm "đang dùng" vì dòng phiếu kho trỏ thẳng `units`, không trỏ `item_units`. |

## Sản phẩm và vật tư (`/items`)

Một bảng `items` cho cả hai loại, phân biệt bằng `type`:

| `type` | Ý nghĩa | Đặc điểm |
|---|---|---|
| `FG` | Thành phẩm | Có BOM và công đoạn riêng (Cấp 0). Mã tự sinh `SP` + 4 chữ số (`DocumentType.ITEM_FG`) nếu bỏ trống. |
| `DIRECT` | Vật tư | Chỉ xuất hiện như node lá trong BOM, không có BOM hay công đoạn riêng. **Mã bắt buộc do người dùng nhập** (`E276`). |

Các cột chỉ có ý nghĩa với `DIRECT` (luôn null hoặc mặc định ở FG): `supplierId`, `minStock`, `directGrade`, `technicalStandard`, `dimensions`, `specificWeight`, `colorSurface`, `description`, `origin`, `leadTime`.

Cột chung: `code`, `revision` (mặc định `R01`), `name`, `type`, `status` (`ACTIVE`/`INACTIVE`), `clientId`, `unitId` (bắt buộc, `restrict`), `imageFileId`, `note`, `clonedFromItemId` (chỉ ghi nguồn gốc, bản sao hoàn toàn độc lập), `createdBy`.

**Cặp (`code`, `revision`) duy nhất** trong các dòng chưa xoá (`uq_items_code_revision_active`), nên một mã bị xoá mềm dùng lại được, và cùng mã được phép tồn tại ở nhiều revision khác nhau.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /items` | `items:read` | Phân trang. Tìm `q` theo mã, revision, tên; lọc `type` (nhiều giá trị), `clientId`, `supplierId`, `status`. |
| `GET /items/options` | `items:read` | Select box: chỉ item `ACTIVE`, sắp theo tên, **tối đa 100 dòng**. |
| `GET /items/export` | `items:read` | Xuất Excel, **cắt im lặng ở 10.000 dòng**, không báo lỗi khi vượt. |
| `GET /items/:itemId` | `items:read` | Chi tiết kèm khách hàng, đơn vị, NCC, người tạo, ảnh, nguồn sao chép, tệp. `E007` nếu không thấy. |
| `GET /items/:itemId/issues` | `items:read` | "Thành phần vật tư": báo cáo chỉ đọc, xem mục BOM bên dưới. |
| `POST /items` | `items:create` | Kiểm cặp (mã, revision), đơn vị (`E011`), khách hàng (`E009`), NCC (`E019`), gắn file; trong transaction cấp mã (nếu cần) và ghi item + `item_files`. Race trùng cặp được bắt ở mã Postgres `23505` rồi trả `E008`. |
| `PATCH /items/:itemId` | `items:update` | Gửi `fileIds` thì thay toàn bộ tài liệu đính kèm. |
| `DELETE /items/:itemId` | `items:delete` | Xoá mềm. Còn `order_items`, `production_order_items` hoặc `production_jobs` trỏ tới thì `E255`. **Không** chặn theo BOM (item đang là thành phần của item khác vẫn xoá được). |
| `POST /items/:itemId/copy` | `items:copy` | Nhân bản, xem bên dưới. |

Mã lỗi: `E007` không thấy, `E008` trùng (mã, revision), `E111` thao tác không dành cho vật tư (ví dụ thêm node BOM vào item `DIRECT`), `E276` vật tư thiếu mã, `E277` sao chép FG thiếu revision.

Tệp: ảnh chính qua `imageFileId`, tài liệu đính kèm qua `item_files` (nhiều file, loại tải lên `ITEM_DOCUMENT`). Mọi file id gửi lên đều phải qua `FilesService.linkFiles` **trước** khi mở transaction (xem phần Files).

### Sao chép (`copy`)

- **FG:** giữ nguyên `code`, bắt buộc nhập `revision` mới (`E277`), nhân bản **cả cây BOM** (kể cả công đoạn), giữ tài liệu đính kèm và ghi `clonedFromItemId`.
- **DIRECT** ("tạo vật tư tương tự"): bắt buộc nhập `code` mới (`E276`), `name` tuỳ chọn, `revision` về `R01`, không có BOM.
- Cặp (mã, revision) mới phải chưa tồn tại (`E008`). Đọc BOM nguồn trước, ghi tất cả trong một transaction.

## BOM (`/items/:itemId/bom`)

Mỗi FG có tối đa một BOM: bảng `boms` là dòng đầu (`itemId` unique, tạo **lười**, tức khi ghi node hoặc công đoạn đầu tiên), các dòng thân nằm ở `bom_items`.

**Cấp 0** là chính item FG. Nó không phải một dòng `bom_items` và không xuất hiện trong mảng trả về của `GET .../bom`; thông tin Cấp 0 đọc qua `GET /items/:itemId`, công đoạn Cấp 0 đọc qua `GET /items/:itemId/operations`.

`bom_items` có hai loại node (`type`):

| Loại | Trỏ `items`? | Dữ liệu |
|---|---|---|
| `COMPONENT` | Không | Cụm cấu trúc riêng của đúng sản phẩm này, không tái sử dụng. `code` và `name` nhập tay trên dòng, `unitId` và `imageFileId` riêng (tuỳ chọn). **Số lượng phải nguyên** (`E055`). |
| `DIRECT` | Có (`itemId`, item phải có `type = DIRECT`, nếu không `E270`) | Node lá. Số lượng được phép lẻ (định mức, tối đa 6 chữ số thập phân). Không được có con, không được gắn công đoạn. |

Ràng buộc DB: `chk_bom_items_node_shape` (đúng một trong hai hình dạng), `quantity > 0`, và unique để một `itemId` không xuất hiện hai lần dưới cùng node cha (`uq_bom_items_bom_item_no_parent`, `uq_bom_items_bom_parent_item`, tách vì `NULL ≠ NULL`).

`parentId` rỗng nghĩa là node nằm ngay dưới Cấp 0; `level` là độ sâu bắt đầu từ 1.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /items/:itemId/bom` | `items:read` | Trả mảng phẳng đã sắp theo thứ tự cây, mỗi node kèm `path` (số thứ tự, dùng dựng STT như "1.0.3"), đơn vị, ảnh và chuỗi công đoạn. Chưa có BOM thì trả mảng rỗng. Code, tên, đơn vị, ảnh của node `DIRECT` đọc qua join `items` thay vì lưu trên dòng. |
| `POST /items/:itemId/bom/items` | `items:bom-manage` | Thêm node. |
| `PATCH /items/:itemId/bom/items/:bomItemId` | `items:bom-manage` | Chỉ sửa số lượng, ghi chú (và `code`, `name`, `unitId`, `imageFileId` của node `COMPONENT`). `type`, `itemId`, `parentId` bất biến: muốn đổi thì xoá rồi thêm lại. |
| `DELETE /items/:itemId/bom/items/:bomItemId` | `items:bom-manage` | Xoá cứng, các node con và công đoạn của node bị xoá theo (cascade). |
| `GET /items/:itemId/bom/items/:bomItemId/directs` | `items:read` | Phân trang các vật tư `DIRECT` là con trực tiếp của một node, tìm theo mã hoặc tên. |

Quy tắc thêm node (`createBomItem`):

1. Item gốc không được là `DIRECT` (`E111`).
2. Đúng hình dạng node: `DIRECT` chỉ có `itemId`; `COMPONENT` chỉ có `code` và `name`; `unitId`/`imageFileId` chỉ cho `COMPONENT` (`E271`).
3. Node cha (nếu có) phải thuộc đúng BOM của item này (`E051`) và không được là `DIRECT` (`E052`).
4. **Vật tư chỉ gắn vào node chưa có con `COMPONENT`** (`E273`). Ngoại lệ: vật tư đánh dấu `isOffStructure` ("ngoài cấu trúc") được gắn cạnh node `COMPONENT`.
5. Trùng `itemId` dưới cùng cha: `E245`.
6. **Thêm một node `COMPONENT` dưới cha đang có vật tư `DIRECT` thì các vật tư đó bị xoá ngầm**, trừ vật tư ngoài cấu trúc. Node cha vừa trở thành node cấu trúc nên không còn khai vật tư trực tiếp trên nó. Đây là hành vi dễ gây bất ngờ cho người dùng.

`GET /items/:itemId/issues` ("Thành phần vật tư") là báo cáo chỉ đọc, **khác** cây BOM: `requiredQty` ở đây là định mức đã **nổ cấp** (nhân luỹ kế số lượng qua chuỗi node cha, gốc bằng 1) và gộp theo `itemId`. Tính trong bộ nhớ rồi mới phân trang.

## Công đoạn (`/operations`) và chuỗi công đoạn

`operations` là danh mục công đoạn (ví dụ Cắt laser, Hàn, Sơn tĩnh điện): `code` unique (người dùng nhập, `E047` nếu trùng), `name`, `type` `INHOUSE`/`OUTSOURCE`, `status`, `note`. Xoá mềm.

`operations.type` chỉ là **gợi ý mặc định** khi gắn công đoạn và là điều kiện lọc cho màn "Gia công ngoài" (`GET /operations?type=OUTSOURCE`). Giá trị thật là `type` trên **từng lần gắn**, nên cùng một công đoạn danh mục có thể là nội bộ ở node này và gia công ngoài ở node khác.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /operations` | `operations:read` | Phân trang, sắp theo tên, lọc `q` (theo tên), `type`, `status`. |
| `GET /operations/options` | `operations:read` | Select box, có giới hạn. |
| `GET /operations/:operationId` | `operations:read` | `E046` nếu không thấy. |
| `POST /operations` | `operations:create` | |
| `PATCH /operations/:operationId` | `operations:update` | |
| `DELETE /operations/:operationId` | `operations:delete` | Xoá mềm. Còn dòng `bom_operations` trỏ tới thì `E248`. |
| `GET /operations/:operationId/assignments` | `operations:read` | Nhân sự đã phân công, phân trang. |
| `GET /operations/:operationId/assignments/ids` | `operations:read` | Chỉ các id (không phân trang), làm lựa chọn hiện tại cho thao tác gán hàng loạt. |
| `PUT /operations/:operationId/assignments` | `operations:update` | Thay toàn bộ danh sách trong một transaction. Mọi người dùng phải đang làm việc (`WORKING`, chưa xoá mềm), nếu không `E278`. |

**Lưu ý đang lệch:** kiểm tra "đang dùng" khi xoá chỉ nhìn `bom_operations` (công đoạn của node `COMPONENT`), không nhìn `routing_operations` (công đoạn Cấp 0). Công đoạn chỉ được gắn ở Cấp 0 vẫn xoá mềm được, để lại dòng `routing_operations` trỏ tới công đoạn đã xoá. Comment trong code vẫn nói không còn bảng `routing_operations` riêng, trong khi bảng này đang tồn tại.

### Phân công công đoạn

Bảng `operation_assignments` (nhiều-nhiều, unique theo cặp) cho biết ai làm ở công đoạn nào: **công đoạn chính là tổ sản xuất**. `OperationAccessService` dùng nó ở màn Thực hiện sản xuất:

- Người có `system:manage` hoặc `production-execution:read-all`: không bị giới hạn.
- Người khác chỉ thấy các công đoạn **đang hoạt động** (chưa xoá mềm, `ACTIVE`) được phân công cho họ. Chưa được phân công thì không thấy gì.
- Truy cập công đoạn ngoài phạm vi: `E279` (403).

### Chuỗi công đoạn của sản phẩm

Có hai bảng gần như giống hệt nhau:

| Bảng | Gắn vào | Route | Quyền |
|---|---|---|---|
| `routing_operations` | `boms.id`, tức **Cấp 0** (chính item FG) | `/items/:itemId/operations` | đọc `items:read`, ghi `items:bom-manage` |
| `bom_operations` | một node `bom_items` loại `COMPONENT` | `/items/:itemId/bom/items/:bomItemId/operations` | như trên |

Quy tắc chung: cả hai có `operationId` (bất biến sau khi thêm, muốn đổi thì xoá rồi thêm lại), `type` (`INHOUSE`/`OUTSOURCE`, mặc định `INHOUSE`), `sortOrder`, `note`. **Không unique** theo (nơi gắn, công đoạn): cùng một công đoạn được lặp lại trong chuỗi (ví dụ Kiểm tra → Gia công → Kiểm tra). PATCH sửa được `type`, `sortOrder`, `note`.

Kiểm tra khi thêm: item tồn tại (`E007`), công đoạn tồn tại (`E046`); với Cấp 0 item không được là `DIRECT` (`E111`); với node thì node phải thuộc BOM của item (`E051`) và không được là node `DIRECT` (`E063`). Không có dòng: `E109`. Đọc có phân trang, tìm theo mã hoặc tên công đoạn. Thêm công đoạn Cấp 0 sẽ tạo `boms` nếu chưa có.

## Tệp (`/files`)

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

## Bảng mã lỗi của khu vực

| Mã | HTTP | Ý nghĩa |
|---|---|---|
| E007 | 404 | Không thấy item |
| E008 | 409 | Trùng cặp (mã, revision) |
| E009 | 404 | Không thấy khách hàng |
| E011 | 404 | Không thấy đơn vị tính |
| E016 / E017 | 400 / 413 | Tệp sai loại / quá lớn |
| E019–E023 | 404/409 | NCC: không thấy / mã trùng / nhóm không có / MST trùng / quốc gia không có |
| E024–E026 | 409/404 | Khách hàng: mã trùng / MST trùng / nhóm không có |
| E042 | 404 | Không thấy tệp |
| E046 / E047 | 404 / 409 | Công đoạn không thấy / mã trùng |
| E050 / E051 | 404 | Node BOM không thấy / node cha không thuộc BOM |
| E052 | 400 | Node cha là lá `DIRECT` |
| E055 | 400 | Số lượng node `COMPONENT` phải nguyên |
| E063 | 400 | Node `DIRECT` không được gắn công đoạn |
| E109 | 404 | Không thấy dòng công đoạn |
| E111 | 400 | Item `DIRECT` không có BOM hoặc công đoạn Cấp 0 |
| E241 / E242 | 409 | Đơn vị: mã trùng / đang được dùng |
| E245 | 409 | Trùng item dưới cùng node cha |
| E246 / E247 / E248 / E255 | 409 | Khách hàng / NCC / công đoạn / item đang được dùng |
| E262 / E263 | 404 / 409 | Quy đổi đơn vị: không thấy / trùng |
| E270 | 400 | Item của node không phải `DIRECT` |
| E271 | 400 | Sai hình dạng node BOM |
| E273 | 400 | Cha đã có con `COMPONENT`, không gắn vật tư trực tiếp |
| E276 / E277 | 400 | Vật tư thiếu mã / sao chép FG thiếu revision |
| E278 / E279 | 400 / 403 | Phân công công đoạn không hợp lệ / công đoạn ngoài phạm vi phân công |
