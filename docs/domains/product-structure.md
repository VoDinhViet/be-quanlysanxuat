# Cấu trúc sản phẩm

Phạm vi: `src/api/` các thư mục `units`, `items`, `item-units`, `boms`, `bom-operations`, `bom-directs`, `routings`, `operations`. Schema ở `src/database/schemas/units/`, `src/database/schemas/items/`, `operations.ts`. Khách hàng và nhà cung cấp nằm ở [partners.md](partners.md); registry tệp (ảnh và tài liệu của item) ở [architecture.md](../architecture.md).

Điểm chung của nhóm này:

- Mã (`code`) do người dùng tự đặt, trừ thành phẩm (FG) tự sinh `SPxxxx` khi bỏ trống. Các giá trị `ITEM_DIRECT`, `UNIT` và `OPERATION` có trong enum `DocumentType` nhưng **không có nơi nào dùng**.
- Xoá mềm bằng `deletedAt` (items, operations). Khoá ngoại từ các bảng chứng từ là `restrict`, nhưng xoá mềm không kích hoạt `restrict`, nên service tự kiểm "đang được dùng" trước khi xoá và trả mã `*.error.in_use` (409). Phép kiểm cố ý **không** lọc `deletedAt` của bảng chứng từ, vì dòng đã xoá mềm vẫn giữ khoá ngoại.
- Create/update phần lớn trả 204 (không có body).
- Tìm kiếm dùng `unaccentILike` (không phân biệt dấu, hoa thường).

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

Tệp: ảnh chính qua `imageFileId`, tài liệu đính kèm qua `item_files` (nhiều file, loại tải lên `ITEM_DOCUMENT`). Mọi file id gửi lên đều phải qua `FilesService.linkFiles` **trước** khi mở transaction (xem mục "Tệp tải lên" trong `architecture.md`).

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


## Bảng mã lỗi của khu vực

| Mã | HTTP | Ý nghĩa |
|---|---|---|
| E007 | 404 | Không thấy item |
| E008 | 409 | Trùng cặp (mã, revision) |
| E011 | 404 | Không thấy đơn vị tính |
| E046 / E047 | 404 / 409 | Công đoạn không thấy / mã trùng |
| E050 / E051 | 404 | Node BOM không thấy / node cha không thuộc BOM |
| E052 | 400 | Node cha là lá `DIRECT` |
| E055 | 400 | Số lượng node `COMPONENT` phải nguyên |
| E063 | 400 | Node `DIRECT` không được gắn công đoạn |
| E109 | 404 | Không thấy dòng công đoạn |
| E111 | 400 | Item `DIRECT` không có BOM hoặc công đoạn Cấp 0 |
| E241 / E242 | 409 | Đơn vị: mã trùng / đang được dùng |
| E245 | 409 | Trùng item dưới cùng node cha |
| E248 / E255 | 409 | Công đoạn / item đang được dùng |
| E262 / E263 | 404 / 409 | Quy đổi đơn vị: không thấy / trùng |
| E270 | 400 | Item của node không phải `DIRECT` |
| E271 | 400 | Sai hình dạng node BOM |
| E273 | 400 | Cha đã có con `COMPONENT`, không gắn vật tư trực tiếp |
| E276 / E277 | 400 | Vật tư thiếu mã / sao chép FG thiếu revision |
| E278 / E279 | 400 / 403 | Phân công công đoạn không hợp lệ / công đoạn ngoài phạm vi phân công |
