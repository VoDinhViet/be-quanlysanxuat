# Production (LSX & Job)

## Purpose

Bắc cầu giữa đơn hàng đã duyệt và việc thật ở xưởng: kiểm tồn thành phẩm, quyết định sản xuất bao
nhiêu, rồi chốt thành đầu việc cho xưởng theo dõi tiến độ.

## Core concepts

**Ba tầng, ba đơn vị đếm:**
```
1 đơn hàng đã duyệt  =  1 LSX (production_orders)
   └─ 1 dòng đơn      =  1 dòng quyết định SX (production_order_items, 1-1)
        └─ 1 item FG  =  1 Job (production_jobs) — GỘP theo sản phẩm, không 1-1 với dòng đơn
```

**Job snapshot 3 thứ từ Product Structure lúc duyệt LSX, độc lập hoàn toàn với master data sống
(denormalize `code`/`name`, FK gốc chỉ còn tham khảo `set null`):**

| Bảng | Nguồn | Sửa sau khi sinh |
| --- | --- | --- |
| `production_job_bom_items` (cây BOM) | `bom_items`, id nhân bản mới | Không route nào sửa |
| `production_job_operations` (công đoạn as-used) | `bom_operations` as-used | `completedQuantity`/`rejectedQuantity`/`completedDate` sửa qua `PATCH .../operations/:id`; phần còn lại đóng băng |
| `production_job_issues` (vật tư, gộp theo `itemId` trên node RM) | `production_job_bom_items.plannedQuantity` (đã nổ cấp) | Không route đọc/ghi — nội bộ, chỉ dùng bởi `startJob`/`bomDemand`/`GET .../bom` |

`production_job_items`/`production_job_units` là 2 bảng chiều (SCD) **dùng chung, không thuộc Job
nào** — khoá bộ ba `(itemId/unitId, code, name)`, get-or-create lúc duyệt LSX, tuyệt đối không
`UPDATE` (một dòng có thể đang dùng chung bởi nhiều Job). `production_job_issues` giữ 2 FK song
song tới hai bảng này.

**Node Cấp 0** — mỗi Job có thêm đúng 1 node `itemType='FG'` (nếu FG có khai routing Cấp 0,
`copyFinalAssemblyRouting`, cùng transaction duyệt LSX; bỏ qua nếu không) — `parentId=null`,
`level=0`, `plannedQuantity=job.quantity`, công đoạn snapshot y hệt node WIP. Tối đa 1 node/Job
(`uq_production_job_bom_items_final_assembly`). Bước Lắp ráp của nó khoá cứng (`E210`) cho tới khi
**mọi công đoạn khác của Job** đã `completedDate` — neo QC thành phẩm cuối, xem
`docs/decisions/oqc-per-operation.md`.

**Duyệt công đoạn** (`POST /production-jobs/:jobId/approve-operations`, `production:approve`) —
điều kiện tiên quyết bắt buộc trước khi `PATCH .../operations/:id` mở (`E250` nếu chưa duyệt, `E251`
nếu duyệt lại). Không khoá gì thêm về cấu trúc (vốn đã bất biến từ lúc duyệt LSX).

**Hai đường ghi cùng chạm `production_job_operations`, có thể lệch nhau:**
- `PATCH .../operations/:id` (quản lý điều chỉnh) — ghi đè cả `completedQuantity`/`rejectedQuantity`,
  `completedDate` set server-side (`new Date()` khi `completedQuantity ≥ plannedQuantity`, về `null`
  nếu sửa xuống dưới).
- `POST /production-execution/operations/:jobOperationId/reports` (xưởng báo cáo) — **cộng dồn**
  (không ghi đè), `completedDate` do người báo **tự chọn**; ghi thêm 1 dòng
  `production_job_operation_reports` (+ ảnh) mỗi lần, không chặn báo cáo rỗng. Qua cùng gate
  (`E087`/`E250`/`E091`/`E210`/`E256`, thứ tự kiểm).
Cả hai chỉ trần riêng `completedQuantity ≤ plannedQuantity` (`E256`) — `rejectedQuantity` không giới
hạn, cho phép báo bù (làm lại phần hỏng) tới khi SL đạt chạm đủ. Trần cũ (`E252`, gộp cả hai số) đã
bỏ vì làm công đoạn kẹt vĩnh viễn khi NG chiếm hết chỗ trước khi SL đạt kịp đủ — không khôi phục.
`SUM(reports)` có thể lệch cột chính thức sau khi `PATCH` ghi đè — cột trên
`production_job_operations` luôn là số chính thức, bảng report chỉ là nhật ký.

`GET /production-jobs/:jobId/bom` trả **bảng vật tư phẳng** (không phải cây), mỗi dòng kèm
`requiredQty` (đã nổ cấp) + `issuedQuantity`/`remainingQuantity` (đọc hàm thuần từ
`inventory-requisitions.query.ts`, xem `docs/domains/inventory.md`). `GET .../operations` đọc mọi
công đoạn as-used (kể cả `OUTSOURCE` + Cấp 0), nhóm theo BOM item, kèm `plannedQuantity` đóng băng.
Cây cha-con snapshot **không có route đọc trực tiếp**.

**"Đề xuất SX" tính một lần lúc duyệt đơn, đóng băng:**
```
Khả dụng   = onHand − reserved (loại trừ chính đơn đang xét, qua excludeOrderId)
Đề xuất SX = Khả dụng ≥ 0 ? max(0, SL đặt − Khả dụng) : SL đặt
Lấy từ tồn = max(0, SL đặt − Đề xuất SX)
```
`reserved` ở đây là `getStockLevels` (nhu cầu đơn hàng mở) — **khác** `reserved` của
`GET /inventory-products` (đã có chứng từ giữ), 2 định nghĩa tách biệt cố ý, xem
`docs/domains/inventory.md`. Đọc lại chi tiết LSX là snapshot, không tính lại.

**jobDueDate** — Job không có cột due date riêng; hạn của Job được coi là `orders.dueDate` của đơn
hàng gốc (qua `production_orders.orderId`). `ReportAlertsResDto.jobDueDate`
(`GET /reports/alerts`) là số đếm Job có `status ≠ COMPLETED` mà jobDueDate đã qua hôm nay (giờ VN)
— tên field trùng tên khái niệm, nhưng field là **số đếm**, không phải bản thân ngày.

Phân bố Job theo `status` (donut "Tiến độ sản xuất") đọc qua `GET /reports/production-progress` —
luôn trả đủ 5 status kể cả `count = 0`; `startDate`/`endDate` lọc theo `orders.dueDate`, cùng cột
`GET /production-jobs` dùng, để 2 route khớp số khi drill-down.

## Entities

| Entity | Vai trò |
| --- | --- |
| `production_orders` | Header LSX; `orderId` unique (1 đơn = 1 LSX) |
| `production_order_items` | Quyết định SX từng dòng, 1-1 `order_items` |
| `production_jobs` | Đầu việc xưởng; unique `(productionOrderId, itemId)` |
| `production_job_bom_items` / `production_job_operations` | Snapshot cây BOM/công đoạn, đóng băng lúc duyệt LSX |
| `production_job_operation_reports` / `_report_files` | Nhật ký báo cáo append-only + ảnh |
| `production_job_issues` | Vật tư của Job — nội bộ, không route |
| `production_job_items` / `production_job_units` | Bảng chiều SCD dùng chung, không `UPDATE` |
| `production_order_logs` | Log thao tác **mức LSX**, append-only |
| `production_job_notes` | Ghi chú tự do trên Job, append-only, không kiểm `status` |

Job không có log thao tác (chỉ `startedBy`/`startedAt`) và không có tài liệu đính kèm — bản vẽ (nếu
có) tra ở BOM sản phẩm theo node (`bom_items.drawingFileId`).

## Lifecycle

**LSX** — một chiều: `PENDING →(approve)→ APPROVED →(mọi Job COMPLETED, tự động)→ COMPLETED`.

**Job** — một chiều, phần lớn tự động:
```
PENDING ──start──> IN_PROGRESS ──approve-operations──> (mở PATCH .../operations/:id)
   ──(không còn công đoạn nào của node FG dở — chỉ đếm lại khi vừa patch 1 op thuộc node FG)──> WAITING_QC
   ──(closeJobIfQcCovered: total>0 && open=0, nhận cả IN_PROGRESS)──> WAITING_DELIVERY
   ──(closeJobIfFullyReceived: nhập kho TP đủ job.quantity)──> COMPLETED
```
5 điểm ghi `production_jobs.status`: `startJob`; `updateProductionJobOperation`
(`PATCH`)/`createJobOperationReport` (`reports`, cùng điều kiện: đếm lại công đoạn FG dở sau khi
vừa patch một công đoạn thuộc node đó); `closeJobIfQcCovered` (gọi từ `confirmOqc`/`confirmIqc`/
`completeIqcAfterSupplierReturn` — chấp nhận cả `IN_PROGRESS`, có thể nhảy thẳng bỏ qua
`WAITING_QC`); `closeJobIfFullyReceived` (cũng cascade `production_orders.status=COMPLETED`).

**Job không khai routing Cấp 0 (không có node `itemType=FG`) không bao giờ tự chuyển
`WAITING_QC`** — điều kiện chỉ đếm lại khi thao tác vừa rồi chạm một công đoạn thuộc node đó; không
có node thì nhánh code không bao giờ chạy. Giới hạn thật, không phải bug.

`report`/`hold`/`resume` ở mức Job chưa có API.

## Business rules

- Duyệt LSX chỉ hợp lệ khi LSX `PENDING` và đơn gốc `AWAITING_PRODUCTION`; trong 1 transaction: chốt
  LSX (+ mã `LSXxxxx`), đẩy đơn `IN_PROGRESS`, sinh Job cho mọi item FG SL > 0 (không có thì không
  lỗi, chỉ không sinh Job nào).
- Sửa SL sản xuất là partial, chỉ khi `PENDING` (`E084`), chỉ tính lại `fromStockQty` — không refresh
  tồn kho. Một đơn bị từ chối rồi duyệt lại **ghi đè hoàn toàn** LSX cũ.
- `PATCH .../operations/:id`: hợp lệ khi Job `IN_PROGRESS` (`E087`) và đã `approve-operations`
  (`E250`); riêng bước Lắp ráp (node Cấp 0) kiểm thêm `E210`; `completedQuantity ≤ plannedQuantity`
  → `E256`. Thứ tự kiểm đầy đủ: `E087` → `E250` → `E091` (công đoạn tồn tại) → `E210` (riêng Cấp 0)
  → `E256`.
- Ghi chú Job (`production_job_notes`) append-only, mọi trạng thái. Ghi chú LSX
  (`production_orders.note`) sửa được mọi trạng thái qua `PATCH .../note`, mỗi lần ghi 1 dòng
  `production_order_logs` (`NOTE_UPDATED`).

## Invariants

- 1 đơn = tối đa 1 LSX; 1 sản phẩm = tối đa 1 Job/LSX; Job chỉ sinh từ transaction duyệt LSX.
- `production_jobs.quantity > 0` (CHECK). LSX `APPROVED` ⟺ có mã + `approvedAt` (CHECK).
- Có LSX `APPROVED` thì dòng `items` của đơn gốc không sửa được (`E080`).
- Cấu trúc `production_job_bom_items`/`production_job_operations` chỉ ghi trong transaction duyệt
  LSX — không route thêm/sửa/xoá node/bước, ngoại lệ duy nhất `completedQuantity`/`rejectedQuantity`/
  `completedDate` (tiến độ, không phải cấu trúc). `production_job_items`/`_units` tuyệt đối không
  `UPDATE` — đổi nội dung luôn là chèn dòng mới.
- Không có chốt chặn tồn kho tổng hợp giữa nhiều đơn cùng sản phẩm — cố ý ngoài phạm vi. Duyệt LSX
  không lập phiếu xuất kho nào.

## Cross-domain dependencies

- **← Orders**: `approveOrder` seed toàn bộ tầng LSX — đường duy nhất tạo LSX.
- **→ Orders**: duyệt LSX là đường duy nhất đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`.
- **← Inventory**: chỉ đọc qua `getStockLevels`/`getMaterialStockLevels`. Domain này không ghi vào
  sổ kho.
- **→ Inventory (ghi, gián tiếp)**: Inventory **ghi ngược** vào `production_jobs.status`/
  `production_orders.status` — xem Lifecycle (`closeJobIfQcCovered`/`closeJobIfFullyReceived`).
  Production không chủ động, chỉ bị đọc/ghi bởi 2 domain kia.
- **↔ Inventory (Phiếu lãnh)**: `inventory_requisitions` đọc `production_job_issues.requiredQty`
  chặn vượt định mức — một chiều đọc; `GET .../bom` đọc ngược dòng `ISSUED` để hiển thị "Đã lãnh".
- **← Inventory (Gia công ngoài)**: `production_job_operations.type`/`production_jobs.status`/
  `production_job_bom_items.plannedQuantity` là anchor đọc-một-chiều cho OS-OUT — không gate ngược
  tiến độ Job.
- **↔ Quality**: `production_job_operations` là anchor cho cả IQC (`OUTSOURCE`) lẫn OQC
  (`INHOUSE`, kể cả Cấp 0). Chiều ghi duy nhất: `POST /production-jobs/:jobId/qc` gọi thẳng
  `OqcService.createOqcForJob` qua DI. Không nhánh QC nào ghi ngược `completedQuantity`/
  `completedDate`, kể cả `SCRAP`. Xem `docs/domains/quality-oqc.md`.
- **→ Purchase Requests**: `startJob` là domain duy nhất ghi vào `purchase_requests` (thiếu vật tư
  tự sinh đề xuất). Không đi ngược.
- **← Product Structure**: đọc đúng 1 lần lúc duyệt LSX (cây `bom_items` + `bom_operations`); sửa
  routing/BOM sau đó không ảnh hưởng Job đã có.

## Common mistakes

1. Duyệt LSX không trừ kho — tồn chỉ đổi khi có người lập phiếu tay.
2. "Đề xuất SX" là snapshot lúc duyệt, không tính lại khi mở lại màn chi tiết.
3. Job gộp theo sản phẩm — dòng quyết định SX mới là tầng 1-1 với dòng đơn.
4. Không có log thao tác của Job — chỉ LSX có; Job chỉ có ghi chú tự do.
5. `APPROVED` là điểm cuối của LSX, chưa có route đưa về `PENDING`.
6. Sửa routing/BOM sau khi Job đã duyệt không cập nhật ngược Job — cả hai là bản copy đóng băng.
7. Chưa có route **sửa** vật tư của Job (`production_job_issues`) — chỉ đọc được qua
   `GET /production-jobs/:jobId/bom` (bảng phẳng, **không phải** cây BOM; cây snapshot không có
   route đọc trực tiếp, BOM sống của sản phẩm tra ở `GET /items/:id/bom`).
8. Tạo OQC không còn qua `POST /oqc` cấp-công-đoạn — chỉ qua `POST /production-jobs/:jobId/qc`
   (cấp Job, không nhận body). `E213` nếu Job không khai Cấp 0; `E214` nếu còn công đoạn Cấp 0 nào
   chưa `completedDate` (không riêng công đoạn cuối).
9. `production_job_operation_reports` là **kết quả** ghi, không phải nguồn tính lại
   `completedQuantity` — sau khi `PATCH` ghi đè, hai số được phép lệch nhau, không phải lỗi đồng bộ.
10. Trần cũ `completedQuantity + rejectedQuantity ≤ plannedQuantity` (`E252`) đã bỏ — chỉ còn trần
    riêng `completedQuantity` (`E256`). Đừng khôi phục trần gộp.

## Related docs

- `docs/workflows/production-order-approval.md`, `docs/workflows/production-job-execution.md`.
- `docs/domains/orders.md`, `docs/domains/inventory.md`.
- `docs/domains/quality-oqc.md`, `docs/decisions/oqc-per-operation.md`,
  `docs/decisions/production-lifecycle-closing.md`.
