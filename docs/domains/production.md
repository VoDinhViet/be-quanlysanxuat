# Production (LSX & Job)

## Purpose

Bắc cầu giữa **đơn hàng đã duyệt** và **việc thật ở xưởng**: kiểm tồn thành phẩm, quyết định sản xuất bao nhiêu, rồi chốt thành các đầu việc cho xưởng theo dõi tiến độ.

## Core concepts

**Ba tầng, ba đơn vị đếm khác nhau** — đây là chỗ mô hình từng bị làm sai và đã sửa lại:

```
1 đơn hàng đã duyệt   =  1 LSX          (production_orders — header)
   └─ 1 dòng PO       =  1 dòng quyết định sản xuất  (production_order_items)
        └─ 1 item FG  =  1 Job          (production_jobs)
```

Tầng giữa giữ **1-1 với dòng đơn hàng** (vì phiếu xuất kho cần khoá theo đó). Tầng Job thì **gộp theo sản phẩm**: hai dòng đơn cùng đặt một sản phẩm sinh ra *một* Job duy nhất, vì Job là đơn vị công việc thực tế của xưởng — không phải đơn vị kế toán kho.

**Job mang theo ba bản sao từ Product Structure lúc duyệt LSX — cây BOM, công đoạn, và vật tư — cả ba
đều là snapshot text độc lập hoàn toàn với `items`/`units` sống, không chỉ độc lập ở mức FK:**

| | `production_job_bom_items` (cây BOM) | `production_job_operations` (công đoạn as-used) | `production_job_issues` (vật tư) |
| --- | --- | --- | --- |
| Nguồn | `bom_items` (cả node WIP lẫn lá RM), id nhân bản hoàn toàn mới | `bom_operations` as-used của từng node WIP (`bomItemId`), `productionJobBomItemId` remap qua id snapshot mới | Mọi lá RM thuộc cây `bom_items` của item, gộp theo `itemId`, nhân với SL Job |
| Vai trò | **Snapshot thuần, đóng băng vĩnh viễn** | **Snapshot cấu trúc đóng băng, tiến độ sửa được** | **Snapshot nội bộ — không có route đọc/ghi nào** |
| Độc lập master data | `code`/`name` denormalize, `itemType` (`WIP`/`RM`) copy, `imageFileId` copy tham chiếu từ `items.imageFileId` lúc duyệt — `itemId` chỉ còn liên kết tham khảo (`set null`) | `code`/`name`/`type` (của công đoạn) denormalize — `operationId` chỉ còn liên kết tham khảo (`set null`) | Mã/tên vật tư + mã/tên ĐVT **không** nằm trên dòng này — hai FK `NOT NULL` `restrict` trỏ sang `production_job_items`/`production_job_units`, hai bảng chiều dùng chung theo bộ ba nội dung (xem dưới); `imageFileId` copy tham chiếu, ở lại dòng này; `itemId` chỉ còn liên kết tham khảo (`set null`) |
| Sửa sau khi sinh | Không có route nào sửa | `completedQuantity`/`completedDate` sửa qua `PATCH .../operations/:operationId` (ghi đè, xem dưới) — phần còn lại (`code`/`name`/`type`/`sortOrder`/`note`/`operationId`) vẫn đóng băng | Không có route sửa — và cũng không có route **đọc**; chỉ còn là nguồn nội bộ |
| Sửa/xoá `items`/`units`/`operations`/BOM gốc sau đó | Không ảnh hưởng Job đã duyệt | Không ảnh hưởng Job đã duyệt | Không ảnh hưởng Job đã duyệt |

**`production_job_items`/`production_job_units` là hai bảng chiều (dimension) dùng chung — không
thuộc về một Job hay một LSX cụ thể nào**, khác ba bảng snapshot còn lại trong bảng trên (tất cả đều
`productionJobId NOT NULL cascade`). Khoá định danh là **bộ ba nội dung** `(itemId, code, name)` /
`(unitId, code, name)` — kiểu SCD type-2: master data không đổi thì mọi Job/LSX dùng chung **một**
dòng (khử trùng lặp text); vật tư/ĐVT đổi mã/tên thì lần duyệt LSX sau sinh dòng **mới**, Job cũ vẫn
trỏ dòng cũ (giữ nguyên nghĩa "đóng băng lúc duyệt"). Bất biến sau khi ghi, không `updatedAt`, không
route sửa — một dòng có thể đang được nhiều Job dùng chung, `UPDATE` là viết lại lịch sử của tất cả.
`production_job_issues` giữ hai FK **song song** tới hai bảng này — chúng không tham chiếu nhau, nên
đổi tên vật tư và đổi tên ĐVT là hai sự kiện độc lập, mỗi cái chỉ sinh dòng mới ở đúng một bên.

`GET /production-jobs/:jobId/bom` trả về **nhu cầu vật tư của Job** (phân trang, `q` lọc mã/tên vật
tư) — đọc `production_job_issues` join hai bảng chiều trên, không đụng cây BOM. Mỗi dòng là một vật
tư đã gộp sẵn: `item` (`{code, name}`, từ `production_job_items`), `unit` (`{code, name}`, từ
`production_job_units`), `requiredQty` (định mức BOM × SL Job, tính sẵn lúc duyệt LSX, không nổ
theo cấp — kế thừa nguyên giới hạn của phép gộp vật tư, xem `docs/domains/product-structure.md`), và
**"Theo dõi đã lãnh"**: `issuedQuantity` (Σ SL lãnh mọi phiếu lãnh vật tư `ISSUED` cùng
`(productionJobId, itemId)`) + `remainingQuantity = max(requiredQty − issuedQuantity, 0)` — đọc
qua hàm thuần từ `src/api/inventory-requisitions/inventory-requisitions.query.ts` (Inventory sở hữu
số liệu, Production chỉ import hàm đọc, đúng tiền lệ `inventory-issues` import `iqc.query.ts`), xem
`docs/domains/inventory.md`, `docs/workflows/inventory-requisition.md`. `item`/`unit` lồng chứ không
phẳng — `code`/`name` trùng tên giữa hai bảng chiều. Vật tư nào chưa có dòng ở đây (Job tạo trước
khi bảng này tồn tại) thì **không xuất hiện** trong danh sách, không phải lỗi. Bản đơn giản hoá có
chủ đích — chưa trả "Dùng cho Part" hay số đã nổ theo cấp, để mở rộng sau nếu cần.

Cây cha-con của Job (`parentId`, `level`, `quantity` từng node) **không được trả ra qua `/bom`** —
snapshot vẫn nằm nguyên trong DB, chỉ là không có API đọc trực tiếp cây đó.
`GET /production-jobs/:jobId/operations` đọc **mọi** công đoạn as-used (cả `INHOUSE` lẫn
`OUTSOURCE`, cộng công đoạn của node Cấp 0 — xem dưới), **nhóm theo BOM item** chứa nó — mỗi phần
tử là `{id, code, name, itemType, operations: [...]}`, dùng quan hệ `productionJobBomItems.operations`
có sẵn (`with`, không phải `.select()`/join thủ công). Chỉ BOM item **có** công đoạn as-used mới
xuất hiện (RM lá và WIP không routing không có `production_job_operations` nên bị lọc ra sau khi
fetch). Cũng là nguồn duy nhất để FE lấy `operationId` cho `PATCH .../operations/:operationId`. Mỗi
công đoạn kèm `plannedQuantity` — đọc thẳng cột `production_job_bom_items.planned_quantity`, tính
**một lần** lúc duyệt LSX (nhân luỹ kế định mức từ gốc xuống × SL Job, `copyBomTree`; node Cấp 0
dùng thẳng `plannedQuantity = job.quantity`) rồi đóng băng, không tính lại lúc đọc. Cùng một node
BOM thì mọi công đoạn của nó có cùng số, vì đây là SL kế hoạch của **node**, không phải của riêng
từng bước; cũng là trần mà `PATCH` đối chiếu (`E088`), và `updateProductionJobOperation`/
`getOutsourceableOperations`/`oqc` đọc chung đúng cột này. Bản đơn giản hoá có chủ đích — vẫn chưa
trả ảnh part hay số đã gửi/nhận gia công ngoài.

**Node Cấp 0 — công đoạn của chính FG có snapshot, khác mô tả cũ.** `production_job_bom_items` nhận
thêm **đúng một** node `itemType = 'FG'` mỗi Job (`ProductionJobsService.copyFinalAssemblyRouting`,
gọi ngay sau `copyBomTree` trong cùng transaction duyệt LSX), chỉ khi item FG có khai routing Cấp 0
(`routings`/`routing_operations` của chính `job.itemId`) — bỏ qua, không tạo node rỗng, nếu không.
Node này `parentId = null`, `level = 0` (ngoài quy ước 1-based của cây con — cố ý), `sortOrder` lớn
nhất Job (đứng cuối danh sách trả về), `quantity = 1`, `plannedQuantity = job.quantity`; công đoạn
của nó snapshot y hệt cách snapshot node WIP thường, không nhánh code riêng. Một Job nhiều nhất một
node như vậy (`uq_production_job_bom_items_final_assembly`, partial unique index). Bước Lắp ráp
(công đoạn duy nhất/đầu tiên của node này, thường vậy) chỉ mở khi **mọi** công đoạn khác của Job đã
báo `completedDate` khác null — `PATCH .../operations/:operationId` chặn `E210` nếu chưa, trước cả
khi kiểm `E088`. Node Cấp 0 là neo để OQC kiểm chất lượng thành phẩm cuối cùng — xem
`docs/decisions/oqc-per-operation.md` mục "QC cho Cấp 0", `docs/domains/quality.md`.

`completedQuantity`/`completedDate` sửa theo **từng công đoạn** (`PATCH .../operations/:operationId`,
không phải theo node): cùng một part có thể công đoạn này đã xong trong khi công đoạn khác chưa. Xem
`docs/workflows/production-job-execution.md`.

Job tạo trước khi các bảng này tồn tại (chưa migrate) trả về rỗng — không phải lỗi, giống
cách BOM chưa có node trả mảng rỗng.

**"Đề xuất SX" được tính một lần, tại thời điểm duyệt đơn, rồi đóng băng.** Công thức:

```
Khả dụng   = onHand − reserved (LOẠI TRỪ chính đơn đang xét)
Đề xuất SX = Khả dụng >= 0 ? max(0, SL đặt − Khả dụng) : SL đặt
Lấy từ tồn = max(0, SL đặt − Đề xuất SX)
```

Chỗ tinh tế: phải **loại trừ chính đơn đang xét** khỏi `reserved`. Đơn đã duyệt nên nó đã tự giữ chỗ rồi — dùng thẳng `available` của màn Kho sẽ trừ nhu cầu của nó hai lần.

**Đọc lại chi tiết LSX là snapshot, không tính lại.** Số liệu tồn kho trong LSX là ảnh chụp lúc duyệt (hoặc lúc sửa số lượng gần nhất) — có thể đã lệch thực tế. Đây là lựa chọn có chủ đích, không phải thiếu sót.

## Entities

| Entity | Vai trò |
| --- | --- |
| `production_orders` | Header LSX; `orderId` **unique** (1 đơn = 1 LSX); mã `LSXxxxx` chỉ có khi đã duyệt |
| `production_order_items` | Quyết định sản xuất từng dòng; 1-1 với `order_items` |
| `production_jobs` | Đầu việc xưởng; unique `(productionOrderId, itemId)` |
| `production_job_bom_items` | Snapshot cây BOM của Job (nhân bản `bom_items`, id mới), đóng băng lúc duyệt LSX — không route sửa |
| `production_job_operations` | Snapshot công đoạn as-used của từng node BOM, đóng băng lúc duyệt LSX — không route sửa |
| `production_job_issues` | Danh sách vật tư của Job, khởi tạo từ BOM lúc duyệt — không có route đọc/ghi, chỉ dùng nội bộ (`startJob` tính vật tư thiếu, `bomDemand` của Inventory/Purchase Requests, `GET .../bom`) |
| `production_job_items` | Bảng chiều dùng chung: mã/tên vật tư đóng băng, khoá `(itemId, code, name)` — không thuộc Job nào, không `updatedAt`, không route sửa |
| `production_job_units` | Bảng chiều dùng chung: mã/tên ĐVT đóng băng, khoá `(unitId, code, name)` — song sinh `production_job_items`, không tham chiếu nó |
| `production_order_logs` | Lịch sử thao tác **ở mức LSX** (append-only) |
| `production_job_notes` | Ghi chú tự do trên Job, người dùng chủ động viết (append-only) |

Job **không có log thao tác** — cố ý bỏ, chỉ `startedBy`/`startedAt` được ghi thật cho hành động
`start`. Job **có ghi chú** (`production_job_notes`) — khác log ở chỗ nội dung do người dùng gõ tay,
không tự sinh khi có hành động, và không ghi lại "ai đã làm gì".

Job **không có tài liệu đính kèm dưới bất kỳ dạng nào** — sản phẩm cũng không còn bảng đính kèm
riêng nữa. Bản vẽ kỹ thuật (nếu có) tra ở BOM của sản phẩm, theo từng node
(`bom_items.drawingFileId`, `docs/domains/product-structure.md`), không phải theo Job.

## Lifecycle

**LSX** — một chiều, chưa có đường lùi:

```
PENDING (kế hoạch, sửa số lượng tự do) ──approve──> APPROVED (chốt, sinh mã LSX + sinh Job)
```

**Job** — hai trạng thái, một chiều, **không có điểm kết thúc**:

```
PENDING ──start──> IN_PROGRESS
```

`report`/`hold`/`resume` (báo sản lượng ở mức Job, tạm dừng/làm tiếp) và trạng thái `WAITING` đã bỏ —
xưởng chưa cần tạm dừng qua API, tạm hoãn để mở rộng sau này. Một Job đã `start` đứng nguyên ở
`IN_PROGRESS` vĩnh viễn — không có route nào đưa nó đi tiếp hay biết Job "đã xong" **ở mức tổng**
(`status` chỉ 2 giá trị). Tiến độ **ở mức từng công đoạn** thì đã trackable — xem
`completedQuantity`/`completedDate` trên `production_job_operations`, mục Core concepts phía trên.

## Business rules

- Duyệt LSX chỉ hợp lệ khi LSX đang `PENDING` **và** đơn gốc vẫn `AWAITING_PRODUCTION`.
- Duyệt LSX làm ba việc trong **một** transaction: chốt LSX (+ sinh mã), đẩy đơn sang `IN_PROGRESS`, sinh Job cho mọi item FG có SL > 0.
- Sửa số lượng sản xuất là **partial** (chỉ dòng gửi lên bị ghi), chỉ khi LSX còn `PENDING` (`E084`), và chỉ tính lại `fromStockQty` — **không** refresh tồn kho.
- LSX không có item FG nào SL > 0 → duyệt xong **không có Job nào**, không phải lỗi.
- Một đơn bị từ chối rồi duyệt lại sẽ **ghi đè hoàn toàn** hồ sơ LSX cũ — không cộng dồn, không giữ lịch sử các lần duyệt.
- Duyệt LSX còn nhân bản **toàn bộ** cây `bom_items` (cả node WIP lẫn lá RM) sang
  `production_job_bom_items`, copy công đoạn as-used của từng node WIP (`bom_operations`) sang
  `production_job_operations`, và gộp riêng mọi lá RM thuộc cây theo `itemId` sang
  `production_job_issues` — tất cả **denormalize luôn `code`/`name`** (và `type` cho công đoạn),
  không chỉ giữ FK, nên độc lập hoàn toàn với việc sửa/xoá `items`/`units`/`operations` sau đó. Riêng
  vật tư: `code`/`name`/ĐVT không nằm trực tiếp trên `production_job_issues` mà qua get-or-create hai
  bảng chiều dùng chung `production_job_items`/`production_job_units` (khoá theo bộ ba nội dung, xem
  Core concepts) — vẫn cùng tinh thần "đóng băng, độc lập master data sống", chỉ khác chỗ lưu. Nhu
  cầu vật tư khởi tạo = định mức BOM × SL Job, tính **một lần** lúc duyệt — không nổ theo cấp (kế
  thừa đúng giới hạn của phép gộp vật tư, xem `docs/domains/product-structure.md`).
- Danh sách vật tư của Job **không expose route nào**, cả đọc lẫn ghi — chỉ là nguồn nội bộ (xem
  Entities).
- Nhập `completedQuantity` cho một công đoạn (`PATCH /production-jobs/:jobId/operations/:operationId`)
  chỉ hợp lệ khi Job đang `IN_PROGRESS` (`E087`), **ghi đè** giá trị cũ (không cộng dồn), và bị chặn
  nếu vượt `plannedQuantity` của node BOM cha (`E088`). `completedDate` do server tự set khi
  `completedQuantity` chạm đủ `plannedQuantity`, tự về `null` nếu sau đó sửa xuống dưới mức đó —
  không có input nhận ngày từ client.
- Ghi chú Job (`production_job_notes`) là **append-only** — `POST` để đăng, không có route sửa/xoá;
  đăng được ở mọi trạng thái Job, không kiểm `status`.
- Ghi chú LSX (`production_orders.note`, expose `productionOrderNote` — khác `note`/`order.note` là
  ghi chú đơn hàng gốc) sửa qua `PATCH .../note`, sửa được ở **mọi trạng thái** LSX, không kiểm
  `status` (khác route sửa số lượng, chỉ `PENDING`). Mỗi lần sửa ghi một dòng
  `production_order_logs` (`NOTE_UPDATED`).

## Invariants

- Một đơn hàng có tối đa một LSX (`orderId` unique).
- Một sản phẩm có tối đa một Job trong một LSX.
- Job chỉ sinh ra từ transaction duyệt LSX — **không có route tạo Job trực tiếp**.
- `quantity` của Job luôn > 0 (DB CHECK) — sản phẩm SL 0 không sinh Job.
- LSX `APPROVED` thì mã `LSXxxxx` và `approvedAt` cùng có; `PENDING` thì cả hai cùng NULL (DB CHECK).
- Đã có LSX `APPROVED` thì dòng `items` của đơn gốc không sửa được nữa (`E080`).
- **Cấu trúc** của `production_job_bom_items`/`production_job_operations` (node/bước, `code`/`name`/
  `type`/`sortOrder`/`quantity`/`parentId`/`plannedQuantity`) chỉ được ghi trong transaction duyệt
  LSX — không có route thêm/sửa/xoá một node/bước, không có kế hoạch thêm. `plannedQuantity` là giá
  trị **dẫn xuất** (nhân luỹ kế `quantity` theo cây × SL Job) nhưng đóng băng cùng lúc với phần còn
  lại, không tính lại lúc đọc. Ngoại lệ duy nhất: `completedQuantity`/
  `completedDate` trên `production_job_operations` sửa được sau đó, qua route riêng (xem Business
  rules) — hai cột này không phải "cấu trúc", là tiến độ.
- `production_job_issues` cũng chỉ có đúng **một** đường ghi (transaction duyệt LSX) tại thời
  điểm viết tài liệu này — chưa có route sửa nào khác, khác `production_job_operations` ở chỗ đây là tạm
  hoãn có chủ đích (dự kiến mở rộng), không phải giới hạn vĩnh viễn.
- `production_job_items`/`production_job_units` **tuyệt đối không có `UPDATE`** ở bất kỳ đường nào —
  không chỉ "chưa có route", mà là bất biến thiết kế: một dòng chiều có thể đang được nhiều Job ở
  nhiều LSX khác nhau dùng chung, sửa nó sẽ viết lại lịch sử của tất cả. Đổi nội dung luôn là chèn
  dòng mới (get-or-create trong `copyBomIssues`), không bao giờ là sửa dòng cũ.

Không phải invariant dù dễ tưởng:

- **Không có chốt chặn tồn kho tổng hợp.** Hai dòng đơn khác nhau cùng một sản phẩm tính "Lấy từ tồn" độc lập trên cùng một con số Khả dụng — cộng lại có thể vượt tồn thực tế. Đã cân nhắc, cố ý để ngoài phạm vi.
- **Duyệt LSX không lập phiếu xuất kho.** Phần "Lấy từ tồn" hiện **không** sinh chứng từ kho nào.

## Cross-domain dependencies

- **← Orders**: `approveOrder` seed toàn bộ tầng LSX. Không có đường nào khác tạo LSX.
- **→ Orders**: duyệt LSX là con đường **duy nhất** đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`.
- **← Inventory**: chỉ đọc, qua `getStockLevels` (LSX, tham số `excludeOrderId`) và
  `getMaterialStockLevels` (`ProductionJobsService.startJob`, tính phần vật tư thiếu). Domain này
  **không ghi** gì vào sổ kho.
- **→ Inventory (Phiếu lãnh vật tư)**: `inventory_requisitions` (`type = PRODUCTION`) đọc
  `production_job_issues.requiredQty` để chặn vượt định mức BOM — một chiều, Production không biết
  module đó tồn tại. Chiều đọc ngược: `GET /production-jobs/:jobId/bom` đọc lại dòng phiếu lãnh
  `ISSUED` để hiển thị "Theo dõi đã lãnh" (`issuedQuantity`/`remainingQuantity`, xem Core concepts)
  — vẫn là Production đọc, không phải Inventory ghi vào bảng nào của Production. Xem
  `docs/domains/inventory.md`, `docs/workflows/inventory-requisition.md`.
- **→ Inventory (Gia công ngoài)**: `production_job_operations.type` (snapshot `OUTSOURCE`) +
  `production_jobs.status` là **anchor đọc-một-chiều** cho mỗi dòng `outsourcing_order_items` —
  Inventory đọc, Production không ghi/biết gì về OS-OUT/OS-IN. `outsourcing-orders` còn đọc thẳng
  cột `production_job_bom_items.plannedQuantity` (đóng băng lúc duyệt LSX, xem trên) cho popup
  "chọn part cần gia công" và chặn gửi vượt định mức. Đợt này **không** có
  gating nào ngược lại: tạo/hủy chứng từ gia công ngoài không tự đổi
  `completedQuantity`/`completedDate` hay chặn công đoạn kế tiếp. Xem `docs/domains/inventory.md`.
- **↔ Quality (IQC/OQC hợp nhất)**: `production_job_operations` (không phải `production_jobs`) là
  **anchor** cho cả hai nhánh QC (`qc_requests.kind`, `docs/decisions/qc-single-table.md`)
  — công đoạn `INHOUSE` (kể cả node Cấp 0) nhận dòng `OUTGOING` (OQC), công đoạn `OUTSOURCE` nhận
  dòng `INCOMING` (IQC sinh từ OS-IN). Quality đọc `operation.productionJob.status` (phải
  `IN_PROGRESS`), `operation.completedQuantity` (trần chặn lot size) và node BOM chứa nó
  (`itemId`/`code`/`name` để snapshot) lúc tạo OQC (`docs/decisions/oqc-per-operation.md`). **Chiều
  ghi**: `ProductionJobsModule` nay import `OqcModule` — `POST /production-jobs/:jobId/qc`
  (`ProductionJobsService.requestJobQc`) gọi thẳng `OqcService.createOqcForJob` qua DI, đúng 1 cạnh
  duy nhất, có chủ đích (thay cho route `POST /oqc` cấp-công-đoạn cũ đã bỏ). **Chiều đọc** vẫn không
  đổi — tóm tắt QC từng công đoạn (từng hiển thị trên `GET /production-jobs/:jobId/bom`) đã bỏ cùng
  lúc route đó đổi sang trả bảng vật tư; `getOqcSummaryByJobOperationIds` đã xoá khỏi
  `src/api/oqc/oqc.query.ts`; `getJobQcCoverage` (gate nhập kho/giao hàng) vẫn là plain function,
  không qua DI. Không nhánh nào của OQC ghi ngược `completedQuantity`/`completedDate`, kể cả khi
  `disposition = SCRAP` (giải phóng quota bằng cách loại trừ khỏi Σ đã xin QC, không phải bằng cách
  trừ `completedQuantity`) — tránh race với thao tác tay của xưởng qua
  `PATCH .../operations/:operationId`. Chiều ngược lại của node Cấp 0: bước Lắp ráp của nó tự khoá
  (`E210`) cho tới khi mọi công đoạn khác báo xong — xem "Core concepts" ở trên. Xem
  `docs/domains/quality.md`.
- **→ Purchase Requests**: `startJob` là domain khác **duy nhất ghi vào** `purchase_requests` —
  vật tư thiếu tồn khi bấm start tự sinh một đề xuất mua, xem
  `docs/workflows/production-job-execution.md`. Không đi ngược: Purchase Requests không đọc/ghi gì
  vào Production.
- **← Product Structure**: đọc **một nguồn duy nhất** trong transaction duyệt LSX, đúng **một lần**:
  toàn bộ cây `bom_items` (WIP + RM) + `bom_operations` as-used của từng node WIP (`bomItemId`),
  nhân bản sang `production_job_bom_items`/`production_job_operations`; vật tư
  (`production_job_issues`) là bản gộp riêng theo `itemId` trên mọi lá RM của cây. Ngoài thời
  điểm đó không đọc lại — sửa routing/BOM/vật tư sau khi đã duyệt không ảnh hưởng Job đã có. Tiến độ
  chia theo **từng công đoạn** (`completedQuantity`/`completedDate`), không chia theo node/Job — xem
  Core concepts.

## Common mistakes

1. **Đi tìm cách biết Job "đã xong" qua API — ở mức tổng.** Không tồn tại — `status` chỉ có 2 giá
   trị và không giá trị nào là điểm cuối, hệ thống không ghi nhận sản lượng đạt/phế ở mức Job. Tiến
   độ **từng công đoạn** thì có (`completedQuantity`/`completedDate`) — đừng nhầm hai mức này.
2. **Tưởng duyệt LSX sẽ trừ kho.** Không lập phiếu xuất kho nào — tồn chỉ đổi khi có người lập phiếu tay.
3. **Tưởng "Đề xuất SX" là số liệu sống.** Là snapshot lúc duyệt; mở lại màn chi tiết không tính lại.
4. **Quên `excludeOrderId` khi tính Khả dụng cho một PO** → trừ nhu cầu của chính nó hai lần.
5. **Tưởng Job map 1-1 với dòng đơn hàng.** Job gộp theo sản phẩm; dòng quyết định sản xuất mới là tầng 1-1.
6. **Tìm log thao tác của Job.** Không tồn tại — chỉ LSX có log. Job chỉ có **ghi chú**
   (`production_job_notes`, người dùng tự viết), không tự sinh khi có hành động.
7. **Tưởng có thể huỷ duyệt LSX.** `APPROVED` hiện là điểm cuối, chưa có route đưa về `PENDING`.
8. **Tưởng sửa routing/BOM của sản phẩm sẽ cập nhật công đoạn/vật tư của Job đã duyệt.** Cả hai đều
   là bản copy đóng băng tại thời điểm duyệt, không đọc lại nguồn.
9. **Tưởng `requiredQty`/`unitQty` là BOM explosion.** Vẫn chỉ là tổng thô theo vật tư (`SUM` trên
   mọi lá RM thuộc cây `bom_items` của item), không nhân qua số lượng của node WIP cha — kế thừa
   nguyên giới hạn đã ghi ở `docs/domains/product-structure.md`. `GET /production-jobs/:jobId/bom`
   trả thẳng `requiredQty` này, không tính lại — kế thừa nguyên giới hạn đó.
10. **Tìm route sửa/thêm/xoá vật tư của Job.** Chưa có, và cũng không có route **đọc** — chỉ là
    nguồn nội bộ.
11. **Đi tìm bảng/route tài liệu đính kèm cho Job.** Không có, và cũng không có đường vòng qua sản
    phẩm — sản phẩm không còn bảng đính kèm. Bản vẽ kỹ thuật (nếu cần) tra ở BOM của sản phẩm, theo
    từng node.
12. **Tưởng công đoạn `type = OUTSOURCE` tự chặn tiến độ hay cần "xác nhận gia công xong" mới cho
    nhập `completedQuantity` cho công đoạn kế tiếp.** Không — đợt này gia công ngoài
    (`docs/domains/inventory.md`) chỉ đọc Job để validate lúc tạo OS-OUT, không ghi/gate gì ngược
    lại tiến độ Job.
13. **Tưởng OQC (`docs/domains/quality.md`) ghi nhận sản lượng đạt/phế cho Job hay công đoạn.**
    Không — OQC chỉ đọc `operation.productionJob.status`/`operation.completedQuantity` để validate
    lúc tạo, kết quả OQC (kể cả `disposition = SCRAP`) không ghi ngược `completedQuantity`/
    `completedDate` của bất kỳ công đoạn nào. Cũng không còn route Production nào đọc ngược dữ liệu
    OQC để hiển thị.
14. **Tưởng OQC vẫn gắn theo cả Job như trước.** Đã đổi — từ khi `docs/decisions/
    oqc-per-operation.md`, một dòng OQC gắn theo **một công đoạn** (`production_job_operations`),
    không phải cả Job; `itemId` của dòng OQC là part đang QC ở đúng công đoạn đó, không phải thành
    phẩm cuối cùng của Job.
16. **Tưởng không có khái niệm "Cấp 0" ở tầng Job, phải đọc `job.itemId → routings` trực tiếp.** Sai
    — `copyFinalAssemblyRouting` snapshot routing Cấp 0 của FG thành một node
    `production_job_bom_items` thật (`itemType = 'FG'`) ngay lúc duyệt LSX, y hệt mọi node WIP khác.
    Xem "Core concepts" ở trên, `docs/decisions/oqc-per-operation.md` mục "QC cho Cấp 0".
17. **Tưởng `PATCH .../operations/:operationId` trên bước Lắp ráp chỉ kiểm `E088` như mọi công
    đoạn khác.** Còn kiểm thêm `E210` trước đó — chặn nếu còn công đoạn nào khác của Job chưa báo
    `completedDate`, vì bước Lắp ráp là bước cuối, cần mọi part đã xong.
18. **Tưởng `oqc_inspections` là bảng riêng của module `oqc`.** Đã gộp vào `qc_requests`
    (cột `kind`) cùng với IQC, xem `docs/decisions/qc-single-table.md` và `docs/domains/quality.md`.
15. **Tưởng `GET /production-jobs/:jobId/bom` trả về cây BOM.** Không — tên route giữ nguyên nhưng
    nội dung là **bảng vật tư phẳng đã gộp**, phân trang. Cây snapshot của Job
    (`production_job_bom_items`/`production_job_operations`) hiện **không có route đọc nào** — chỉ
    còn `GET .../operations` đọc công đoạn (kèm part chứa nó), phục vụ `PATCH
    .../operations/:operationId`. Cây BOM của sản phẩm thì tra `GET /items/:id/bom` (BOM **sống**,
    không phải snapshot của Job — hai thứ khác nhau).
19. **Tưởng vẫn tạo OQC theo từng công đoạn qua `POST /oqc`.** Đã bỏ — tạo OQC nay chỉ qua
    `POST /production-jobs/:jobId/qc`, **cấp Job, không nhận body**: 1 cú bấm, server tự resolve
    công đoạn Cấp 0 và tự suy `quantity`/`inspectionDate`. Job không khai báo routing Cấp 0 → `E213`;
    Job còn công đoạn nào chưa `completedDate` (kể cả chính công đoạn Cấp 0) → `E214`. Xem
    `docs/domains/quality.md` mục "Trigger từ production".

## Related docs

- `docs/workflows/production-order-approval.md`, `docs/workflows/production-job-execution.md` —
  trình tự chạy của hai chặng.
- `docs/domains/orders.md` — điều kiện để một đơn tới được đây.
- `docs/domains/inventory.md` — nguồn `onHand`/`reserved`.
- `docs/domains/quality.md` — OQC, gắn theo công đoạn để kiểm chất lượng.
- `docs/decisions/oqc-per-operation.md` — vì sao OQC đổi từ gắn Job sang gắn công đoạn.
