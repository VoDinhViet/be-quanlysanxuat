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

| | `production_job_bom_items` (cây BOM) | `production_job_operations` (công đoạn as-used) | `production_job_materials` (vật tư) |
| --- | --- | --- | --- |
| Nguồn | `bom_items` (cả node WIP lẫn lá RM), id nhân bản hoàn toàn mới | `bom_operations` as-used của từng node WIP (`bomItemId`), `productionJobBomItemId` remap qua id snapshot mới | Mọi lá RM thuộc cây `bom_items` của item, gộp theo `itemId`, nhân với SL Job |
| Vai trò | **Snapshot thuần, đóng băng vĩnh viễn** | **Snapshot cấu trúc đóng băng, tiến độ sửa được** | **Snapshot, hiện read-only** |
| Độc lập master data | `code`/`name` denormalize, `itemType` (`WIP`/`RM`) copy — `itemId` chỉ còn liên kết tham khảo (`set null`) | `code`/`name`/`type` (của công đoạn) denormalize — `operationId` chỉ còn liên kết tham khảo (`set null`) | `materialCode`/`materialName`/`unitCode`/`unitName` denormalize, `imageFileId` copy tham chiếu — `itemId` chỉ còn liên kết tham khảo (`set null`) |
| Sửa sau khi sinh | Không có route nào sửa | `completedQuantity`/`completedDate` sửa qua `PATCH .../operations/:operationId` (ghi đè, xem dưới) — phần còn lại (`code`/`name`/`type`/`sortOrder`/`note`/`operationId`) vẫn đóng băng | **Chưa có route sửa** — tạm hoãn, dự kiến mở rộng sang CRUD từng dòng (thêm/sửa/xoá) sau này |
| Sửa/xoá `items`/`units`/`operations`/BOM gốc sau đó | Không ảnh hưởng Job đã duyệt | Không ảnh hưởng Job đã duyệt | Không ảnh hưởng Job đã duyệt |

`GET /production-jobs/:jobId/bom` trả về **danh sách phẳng cha-con** (không lồng cây ở backend — FE
tự dựng qua `parentId`): mỗi phần tử là một node `production_job_bom_items` thật (WIP hoặc RM, phân
biệt qua `itemType`), kèm `production_job_operations` as-used của đúng node đó
(`productionJobBomItemId` luôn có giá trị — mỗi bước công đoạn luôn gắn với đúng một node BOM).
**Không** gồm item FG gốc — `parentId = null` là node top-level, con trực tiếp của FG; không có
khái niệm "Cấp 0" riêng ở tầng Job — routing Cấp 0 của chính FG (`routings`/`routing_operations`,
khoá `itemId`) không được snapshot, đọc trực tiếp qua `job.itemId` nếu cần. `level` (độ sâu 1-based)
copy nguyên từ `bom_items.level` lúc duyệt LSX, cùng quy ước với `GET /items/:id/bom`. Xem
`docs/workflows/production-job-execution.md`.

Mỗi node còn có `plannedQuantity` — **tính lúc đọc, không lưu cột**: SL Job (`production_jobs.quantity`)
nhân luỹ kế `quantity` (định mức trên 1 đơn vị cha) từ gốc xuống tới node đó
(`resolvePlannedQuantities`, `src/api/production-jobs/production-job-planned-quantity.ts` — pure
function, không DI, tách khỏi `ProductionJobsService` để `outsourcing-orders` gọi thẳng cho popup
"chọn part cần gia công" và chặn gửi vượt định mức, `docs/domains/inventory.md`). An toàn tính lại
mỗi lần vì `quantity`/`parentId` của node và SL Job đều bất biến sau khi duyệt. Khác
`production_job_materials.requiredQty` — vẫn cố ý không nổ theo cấp, xem
`docs/domains/product-structure.md`. Mỗi `production_job_operations` con của
một node mang cùng `plannedQuantity` với node đó, cộng thêm `completedQuantity`/`completedDate` —
tiến độ **tự nhập, ghi đè, theo từng công đoạn** (không phải theo node): cùng một part có thể công
đoạn này đã xong trong khi công đoạn khác chưa, xem `docs/workflows/production-job-execution.md`.

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
| `production_job_materials` | Danh sách vật tư của Job, khởi tạo từ BOM lúc duyệt — sửa được khi Job còn `PENDING` |
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
  `production_job_materials` — tất cả **denormalize luôn `code`/`name`** (và `type` cho công đoạn),
  không chỉ giữ FK, nên độc lập hoàn toàn với việc sửa/xoá `items`/`units`/`operations` sau đó. Nhu
  cầu vật tư khởi tạo = định mức BOM × SL Job, tính **một lần** lúc duyệt — không nổ theo cấp (kế
  thừa đúng giới hạn của phép gộp vật tư, xem `docs/domains/product-structure.md`).
- Danh sách vật tư của Job hiện **read-only** sau khi sinh — chưa có route sửa/thêm/xoá, tạm hoãn,
  dự kiến mở rộng sang CRUD từng dòng sau này.
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
  `type`/`sortOrder`/`quantity`/`parentId`) chỉ được ghi trong transaction duyệt LSX — không có route
  thêm/sửa/xoá một node/bước, không có kế hoạch thêm. Ngoại lệ duy nhất: `completedQuantity`/
  `completedDate` trên `production_job_operations` sửa được sau đó, qua route riêng (xem Business
  rules) — hai cột này không phải "cấu trúc", là tiến độ.
- `production_job_materials` cũng chỉ có đúng **một** đường ghi (transaction duyệt LSX) tại thời
  điểm viết tài liệu này — chưa có route sửa nào khác, khác `production_job_operations` ở chỗ đây là tạm
  hoãn có chủ đích (dự kiến mở rộng), không phải giới hạn vĩnh viễn.

Không phải invariant dù dễ tưởng:

- **Không có chốt chặn tồn kho tổng hợp.** Hai dòng đơn khác nhau cùng một sản phẩm tính "Lấy từ tồn" độc lập trên cùng một con số Khả dụng — cộng lại có thể vượt tồn thực tế. Đã cân nhắc, cố ý để ngoài phạm vi.
- **Duyệt LSX không lập phiếu xuất kho.** Phần "Lấy từ tồn" hiện **không** sinh chứng từ kho nào.

## Cross-domain dependencies

- **← Orders**: `approveOrder` seed toàn bộ tầng LSX. Không có đường nào khác tạo LSX.
- **→ Orders**: duyệt LSX là con đường **duy nhất** đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`.
- **← Inventory**: chỉ đọc, qua `getStockLevels` (LSX, tham số `excludeOrderId`) và
  `getMaterialStockLevels` (`ProductionJobsService.startJob`, tính phần vật tư thiếu). Domain này
  **không ghi** gì vào sổ kho.
- **→ Inventory (Gia công ngoài)**: `production_job_operations.type` (snapshot `OUTSOURCE`) +
  `production_jobs.status` là **anchor đọc-một-chiều** cho mỗi dòng `outsourcing_order_items` —
  Inventory đọc, Production không ghi/biết gì về OS-OUT/OS-IN. `outsourcing-orders` còn gọi thẳng
  `resolvePlannedQuantities` (pure function, cùng file mọi module import — không qua DI) để tính
  định mức cho popup "chọn part cần gia công" và chặn gửi vượt định mức. Đợt này **không** có
  gating nào ngược lại: tạo/hủy chứng từ gia công ngoài không tự đổi
  `completedQuantity`/`completedDate` hay chặn công đoạn kế tiếp. Xem `docs/domains/inventory.md`.
- **→ Quality (OQC)**: `production_jobs.status`/`quantity` là **anchor đọc-một-chiều** cho
  `oqc_inspections` — Quality đọc để validate lúc tạo (`IN_PROGRESS`) và giới hạn tổng lot size
  (không vượt `quantity`), Production không ghi/biết gì về OQC. Cùng khuôn với gia công ngoài ở
  trên. Xem `docs/domains/quality.md`.
- **→ Purchase Requests**: `startJob` là domain khác **duy nhất ghi vào** `purchase_requests` —
  vật tư thiếu tồn khi bấm start tự sinh một đề xuất mua, xem
  `docs/workflows/production-job-execution.md`. Không đi ngược: Purchase Requests không đọc/ghi gì
  vào Production.
- **← Product Structure**: đọc **một nguồn duy nhất** trong transaction duyệt LSX, đúng **một lần**:
  toàn bộ cây `bom_items` (WIP + RM) + `bom_operations` as-used của từng node WIP (`bomItemId`),
  nhân bản sang `production_job_bom_items`/`production_job_operations`; vật tư
  (`production_job_materials`) là bản gộp riêng theo `itemId` trên mọi lá RM của cây. Ngoài thời
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
   nguyên giới hạn đã ghi ở `docs/domains/product-structure.md`.
10. **Tìm route sửa/thêm/xoá vật tư của Job.** Chưa có — tạm hoãn, dự kiến mở rộng sau này.
11. **Đi tìm bảng/route tài liệu đính kèm cho Job.** Không có, và cũng không có đường vòng qua sản
    phẩm — sản phẩm không còn bảng đính kèm. Bản vẽ kỹ thuật (nếu cần) tra ở BOM của sản phẩm, theo
    từng node.
12. **Tưởng công đoạn `type = OUTSOURCE` tự chặn tiến độ hay cần "xác nhận gia công xong" mới cho
    nhập `completedQuantity` cho công đoạn kế tiếp.** Không — đợt này gia công ngoài
    (`docs/domains/inventory.md`) chỉ đọc Job để validate lúc tạo OS-OUT, không ghi/gate gì ngược
    lại tiến độ Job.
13. **Tưởng OQC (`docs/domains/quality.md`) ghi nhận sản lượng đạt/phế cho Job.** Không — OQC chỉ
    đọc `production_jobs.status`/`quantity` để validate lúc tạo, kết quả OQC không ghi ngược vào
    Job hay công đoạn nào. "Sản lượng đạt" chỉ tồn tại dưới dạng tổng `quantity` các dòng
    `oqc_inspections` của Job, ở domain Quality — không phải một cột trên `production_jobs`.

## Related docs

- `docs/workflows/production-order-approval.md`, `docs/workflows/production-job-execution.md` —
  trình tự chạy của hai chặng.
- `docs/domains/orders.md` — điều kiện để một đơn tới được đây.
- `docs/domains/inventory.md` — nguồn `onHand`/`reserved`.
- `docs/domains/quality.md` — OQC, đọc Job để kiểm chất lượng lô thành phẩm.
