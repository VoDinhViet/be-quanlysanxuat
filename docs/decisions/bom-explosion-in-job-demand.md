# Nhu cầu vật tư của Job đổi sang nổ cấp BOM đa cấp

**Trạng thái:** còn hiệu lực

## Bối cảnh

`ProductionJobsService.copyBomIssues` (nguồn ghi duy nhất của `production_job_issues.requiredQty`)
từng gộp phẳng mọi lá RM trong cây `bom_items` (`SUM(quantity) GROUP BY itemId`) rồi nhân với SL
Job — **không nhân qua số lượng của các node WIP cha ở giữa**. Đây từng là giới hạn có chủ đích, ghi
rõ trong code lẫn `docs/domains/product-structure.md`/`docs/domains/production.md`/
`docs/domains/inventory.md`.

Đo trực tiếp trên dữ liệu thật: BOM 3 cấp, node cha WIP SL 3, node con RM SL 4 — nhu cầu đúng là 12,
hệ thống cũ tính 4 (thiếu 67%). Dữ liệu khách hàng dùng BOM đa cấp thật, nên giới hạn "không nổ theo
cấp" không còn chấp nhận được.

Đáng chú ý: `ProductionJobsService.copyBomTree` (chạy ngay **trước** `copyBomIssues` trong cùng
transaction) đã tính đúng số nổ cấp từ trước — `production_job_bom_items.plannedQuantity = SL cha
đã nổ cấp × quantity node`, cho mọi node kể cả lá RM. `copyBomIssues` chỉ đơn giản không tái dùng số
đó.

## Quyết định

**Nhu cầu vật tư của Job (`production_job_issues`) và "Thành phần vật tư" của một item
(`GET /items/:itemId/issues`) đều phải là giá trị đã nổ cấp** — nhân luỹ kế `quantity` qua toàn
bộ chuỗi node cha, không phải tổng thô theo vật tư. Chuẩn đầy đủ (seed, gộp theo itemId, RM luôn là
lá) chuyển sang ghi ở `docs/domains/product-structure.md`, mục "Chuẩn nổ cấp BOM" — đây là **quy
tắc**, không lặp lại ở đây.

- `copyBomIssues` đổi nguồn: đọc lại `production_job_bom_items.plannedQuantity` (đã nổ cấp, vừa
  được `copyBomTree` insert trong cùng `tx`) thay vì tự truy vấn phẳng từ `bom_items`. Bắt buộc chạy
  **sau** `copyBomTree`.
- `GET /items/:itemId/issues` đổi từ 1 dòng/1 node `bom_items` sang 1 dòng/1 vật tư (nổ cấp + gộp
  theo `itemId`) — đổi shape DTO, kéo theo sửa FE tab "Thành phần vật tư" (`web-qlsx-start`).
- Migration data-only backfill lại `production_job_issues.requiredQty`/`unitQty` cho mọi Job đã tồn
  tại từ nguồn `production_job_bom_items.plannedQuantity` (cột này đã đúng sẵn cho toàn bộ Job lịch
  sử nhờ một migration backfill trước đó dùng `WITH RECURSIVE`).

Route cây `GET /items/:itemId/bom` ("Cấu trúc & Công đoạn") **không đổi** — SL mỗi node so với cha
trực tiếp vẫn đúng và cần thiết cho một màn xem/biên tập cấu trúc.

## Hệ quả kéo theo

- Job đang lãnh dở dang sẽ thấy "SL BOM còn lại" tăng — đúng bản chất (trước đó lãnh thiếu so với
  nhu cầu thật), không phải hồi quy.
- Gate `E232` (chặn lãnh vượt `requiredQty`) nới ra cho các phiếu trước đây bị chặn oan vì số nền
  thấp hơn thực tế.
- `available` trên `GET /inventory-products`/`GET /inventory-materials` giảm theo, có thể xuống âm —
  hành vi cố ý sẵn có của công thức `onHand − reserved − bomDemand`, không phải lỗi mới.
- Job đã `IN_PROGRESS` trước migration không tự chạy lại `collectJobIssueShortages` — đề xuất mua
  hàng tự sinh lúc `startJob` cho các Job đó vẫn giữ số cũ, cần vận hành tự xử lý nếu cần.

## Đừng hoàn lại

Đừng quay về gộp phẳng `SUM(quantity) GROUP BY itemId` trên `bom_items`/`quantity` thô với lý do
"đơn giản hơn" hay "chưa cần đa cấp" — dữ liệu thật của khách hàng đã xác nhận dùng BOM nhiều cấp,
và giới hạn cũ đã gây thiếu vật tư thực tế ở xưởng.

## Related docs

- `docs/domains/product-structure.md` — "Chuẩn nổ cấp BOM" (quy tắc đầy đủ).
- `docs/domains/production.md` — bảng so sánh 3 bảng snapshot của Job.
- `docs/domains/inventory.md` — công thức `bomDemand`/`available` đọc số đã nổ cấp này.
