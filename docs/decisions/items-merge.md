# Gộp `products` + `materials` thành `items`

## Quyết định

`products` (FG/WIP) và `materials` (vật tư) gộp thành một bảng `items` duy nhất, phân biệt bằng
`type = FG | WIP | RM`. Kéo theo:

- **`bom_materials` gộp vào `bom_items`** — vật tư (RM) giờ là lá trong cùng cây BOM với node WIP,
  không còn bảng con riêng. RM là lá bắt buộc: không nhận node con (`E052`), không gắn được
  `bom_operations` (`E063`).
- **Mọi bảng từng mang XOR `productId`/`materialId` + `itemType`** (`inventory_balances`,
  `inventory_transactions`, `inventory_receipt_items`, `inventory_issue_items`,
  `production_job_bom_items`) co lại còn một `itemId` — 4 bảng kho drop hẳn cột `itemType`, chỉ
  `production_job_bom_items` (snapshot đóng băng) giữ `itemType` vì nó thật sự cần phân biệt
  loại node ở dữ liệu đã đóng băng — **cả 3 giá trị `FG`/`WIP`/`RM`**, không chỉ WIP/RM: mỗi Job có
  thêm đúng một node `itemType = 'FG'` cho bước lắp ráp Cấp 0 (`docs/decisions/oqc-per-operation.md`).
- **`product_operations` (routing Cấp 0) đổi thành cặp header/detail `routings` +
  `routing_operations`**, cùng khuôn `boms`/`bom_items` — trước đó là bảng phẳng, không có header.
  Route API không đổi (`/items/:itemId/operations`), chỉ tầng lưu trữ đổi.
- **Nhóm hàng hoá bỏ hẳn** — `product_groups`/`material_groups` bị xoá, không có bảng nhóm thay
  thế. `type` là thứ duy nhất phân loại `items`.
- **Đính kèm của vật tư bỏ hẳn** — `material_attachments` bị xoá (0 dòng dữ liệu thật tại thời điểm
  gộp). `imageFileId` (ảnh đại diện) vẫn giữ, cùng khuôn `products` cũ.
- **`MaterialType` (INTERNAL/CLIENT) bỏ hẳn** — ownership giờ suy từ `clientId` có set hay không,
  không còn cột/enum riêng, không còn validate "CLIENT bắt buộc có `clientId`".
- **Xoá `items` là soft delete cho mọi `type`** — trước đó `products` xoá mềm nhưng chưa có route,
  `materials` xoá cứng có kiểm "đang được dùng". Giờ thống nhất xoá mềm, không kiểm tham chiếu
  (cùng khuôn `clients`/`orders`/`suppliers`).
- Tầng API còn một module `/items` (permission `items:*`), thay cho `/products` + `/materials` +
  `/product-groups` + `/material-groups` + `/bom-materials` (bị xoá hẳn) +
  `/products/:id/operations` (đổi thành `/items/:id/operations`).

## Vì sao

Hai bảng gần như song sinh (cùng `code`/`name`/`unitId`/`clientId`/`imageFileId`/`status`/`note`,
cùng khuôn service) buộc năm bảng kho phải mang một cặp FK nullable + discriminator + CHECK chỉ để
diễn đạt "mặt hàng này hoặc là sản phẩm hoặc là vật tư". Gộp bảng xoá luôn nhu cầu discriminator đó
ở phần lớn các chỗ dùng.

## Đừng làm ngược lại

- **Đừng tách vật tư (RM) ra bảng riêng nữa.** `bom_materials` từng bị tách ra khỏi `bom_items`
  đúng hai commit trước quyết định này, rồi gộp lại ngay sau đó khi nhìn thấy bức tranh đầy đủ
  (XOR lặp lại ở cả 5 bảng kho, không chỉ ở BOM). Nếu vật tư cần thêm field không áp dụng cho
  FG/WIP, để nullable trên `items`, đừng tách bảng.
- **Đừng hồi sinh nhóm hàng hoá bằng cách thêm cột `groupId` lên `items`.** Nếu nghiệp vụ thật sự
  cần phân loại lại, cân nhắc dùng `type` mở rộng hoặc một cơ chế tag rời, không phải một bảng
  nhóm 1-n cứng như cũ.
- **Đừng coi `routings`/`routing_operations` là dư thừa so với `item_operations` phẳng cũ.** Header
  tồn tại để nhất quán với `boms`/`bom_items` — cả hai đều là "một root, nhiều dòng con", cùng
  pattern get-or-create lười.

## Phạm vi KHÔNG đổi trong đợt này

Đây là quyết định đảo chiều cho đúng **phần ITEMS + BOM tree**. Sơ đồ ERD gợi ý các mở rộng khác
(`uoms` thay `units`, `customers` thay `clients`, `work_centers`, `uom_id`/`scrap_percent` trên
dòng BOM, gia công ngoài trên routing) **không nằm trong đợt này** — `units`/`clients` giữ nguyên
tên, `bom_items` không có `uom_id`/`scrap_percent`, routing không có `work_centers`/gia công ngoài.
Đừng giả định các phần đó đã tồn tại chỉ vì `items`/`routings` đã theo đúng khuôn ERD.

*Cập nhật:* "gia công ngoài" đã đảo ngược **một phần** — ở **tầng thực thi (Job)**, qua chứng từ
OS-OUT/OS-IN khoá theo `production_job_operations` (`outsourcing_orders`/`outsourcing_receipts`,
xem `docs/domains/inventory.md`). `routing_operations`/`bom_operations` **vẫn không có** cột NCC/
chi phí gia công nào — phần loại trừ đó ở tầng cấu trúc BOM/routing còn nguyên hiệu lực, chỉ tầng
thực thi Job là có thay đổi.

## Liên quan

- `docs/domains/product-structure.md` — mô hình `items`/BOM đầy đủ sau khi gộp.
- `docs/domains/partners.md` — phần vật tư đã chuyển sang `product-structure.md`.
- `docs/domains/inventory.md`, `docs/domains/production.md`, `docs/domains/purchase-requests.md` —
  các chỗ từng mô tả XOR/`materialId` đã cập nhật theo `itemId`.
