# Production (LSX & Job)

## Purpose

Bắc cầu giữa **đơn hàng đã duyệt** và **việc thật ở xưởng**: kiểm tồn thành phẩm, quyết định sản xuất bao nhiêu, rồi chốt thành các đầu việc cho xưởng theo dõi tiến độ.

## Core concepts

**Ba tầng, ba đơn vị đếm khác nhau** — đây là chỗ mô hình từng bị làm sai và đã sửa lại:

```
1 đơn hàng đã duyệt   =  1 LSX          (production_orders — header)
   └─ 1 dòng PO       =  1 dòng quyết định sản xuất  (production_order_items)
        └─ 1 sản phẩm FG  =  1 Job      (production_jobs)
```

Tầng giữa giữ **1-1 với dòng đơn hàng** (vì phiếu xuất kho cần khoá theo đó). Tầng Job thì **gộp theo sản phẩm**: hai dòng đơn cùng đặt một sản phẩm sinh ra *một* Job duy nhất, vì Job là đơn vị công việc thực tế của xưởng — không phải đơn vị kế toán kho.

**Job mang theo hai bản sao từ Product Structure lúc duyệt LSX — công đoạn và vật tư — nhưng hai bản sao này khác nhau về bản chất:**

| | `production_job_steps` (công đoạn) | `production_job_materials` (vật tư) |
| --- | --- | --- |
| Nguồn | Routing **Cấp 0** của FG (`routing_steps.productId = job.productId`) | `bom_items` MATERIAL gộp theo vật tư, nhân với SL Job |
| Vai trò | **Snapshot thuần, đóng băng vĩnh viễn** | **Snapshot, hiện read-only** |
| Sửa sau khi sinh | Không có route nào sửa | **Chưa có route sửa** — tạm hoãn, dự kiến mở rộng sang CRUD từng dòng (thêm/sửa/xoá) sau này |
| Sửa routing/BOM gốc sau đó | Không ảnh hưởng Job đã duyệt | Không ảnh hưởng Job đã duyệt |

Job tạo trước khi hai bảng này tồn tại (chưa migrate) trả về rỗng ở cả hai — không phải lỗi, giống
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
| `production_jobs` | Đầu việc xưởng; unique `(productionOrderId, productId)` |
| `production_job_steps` | Snapshot công đoạn Cấp 0 của Job, đóng băng lúc duyệt LSX — không route sửa |
| `production_job_materials` | Danh sách vật tư của Job, khởi tạo từ BOM lúc duyệt — sửa được khi Job còn `PENDING` |
| `production_order_logs` | Lịch sử thao tác **ở mức LSX** (append-only) |

Job **không có** log thao tác — cố ý bỏ. Chỉ `startedBy`/`startedAt` được ghi thật cho hành động
`start`.

## Lifecycle

**LSX** — một chiều, chưa có đường lùi:

```
PENDING (kế hoạch, sửa số lượng tự do) ──approve──> APPROVED (chốt, sinh mã LSX + sinh Job)
```

**Job** — hai trạng thái, một chiều, **không có điểm kết thúc**:

```
PENDING ──start──> IN_PROGRESS
```

`report`/`hold`/`resume` (báo sản lượng, tạm dừng/làm tiếp) và trạng thái `WAITING` đã bỏ — xưởng
hiện chưa cần theo dõi sản lượng hay tạm dừng qua API, tạm hoãn để mở rộng sau này. Một Job đã
`start` đứng nguyên ở `IN_PROGRESS` vĩnh viễn — không có route nào đưa nó đi tiếp hay biết nó "đã
xong", vì hệ thống hiện không ghi nhận sản lượng đạt/phế qua API nào cả.

## Business rules

- Duyệt LSX chỉ hợp lệ khi LSX đang `PENDING` **và** đơn gốc vẫn `AWAITING_PRODUCTION`.
- Duyệt LSX làm ba việc trong **một** transaction: chốt LSX (+ sinh mã), đẩy đơn sang `IN_PROGRESS`, sinh Job cho mọi sản phẩm có SL > 0.
- Sửa số lượng sản xuất là **partial** (chỉ dòng gửi lên bị ghi), chỉ khi LSX còn `PENDING` (`E084`), và chỉ tính lại `fromStockQty` — **không** refresh tồn kho.
- LSX không có sản phẩm nào SL > 0 → duyệt xong **không có Job nào**, không phải lỗi.
- Một đơn bị từ chối rồi duyệt lại sẽ **ghi đè hoàn toàn** hồ sơ LSX cũ — không cộng dồn, không giữ lịch sử các lần duyệt.
- Duyệt LSX còn copy công đoạn (routing Cấp 0 của FG) và vật tư (BOM gộp theo vật tư) vào hai bảng
  riêng của từng Job. Nhu cầu vật tư khởi tạo = định mức BOM × SL Job, tính **một lần** lúc duyệt —
  không nổ theo cấp (kế thừa đúng giới hạn của `GET /products/:id/bom/materials`, xem
  `docs/domains/product-structure.md`).
- Danh sách vật tư của Job hiện **read-only** sau khi sinh — chưa có route sửa/thêm/xoá, tạm hoãn,
  dự kiến mở rộng sang CRUD từng dòng sau này.

## Invariants

- Một đơn hàng có tối đa một LSX (`orderId` unique).
- Một sản phẩm có tối đa một Job trong một LSX.
- Job chỉ sinh ra từ transaction duyệt LSX — **không có route tạo Job trực tiếp**.
- `quantity` của Job luôn > 0 (DB CHECK) — sản phẩm SL 0 không sinh Job.
- LSX `APPROVED` thì mã `LSXxxxx` và `approvedAt` cùng có; `PENDING` thì cả hai cùng NULL (DB CHECK).
- Đã có LSX `APPROVED` thì dòng `items` của đơn gốc không sửa được nữa (`E080`).
- `production_job_steps` chỉ được ghi trong transaction duyệt LSX — không có route thêm/sửa/xoá một
  bước của Job, không có kế hoạch thêm.
- `production_job_materials` cũng chỉ có đúng **một** đường ghi (transaction duyệt LSX) tại thời
  điểm viết tài liệu này — chưa có route sửa nào khác, khác `production_job_steps` ở chỗ đây là tạm
  hoãn có chủ đích (dự kiến mở rộng), không phải giới hạn vĩnh viễn.

Không phải invariant dù dễ tưởng:

- **Không có chốt chặn tồn kho tổng hợp.** Hai dòng đơn khác nhau cùng một sản phẩm tính "Lấy từ tồn" độc lập trên cùng một con số Khả dụng — cộng lại có thể vượt tồn thực tế. Đã cân nhắc, cố ý để ngoài phạm vi.
- **Duyệt LSX không lập phiếu xuất kho.** Phần "Lấy từ tồn" hiện **không** sinh chứng từ kho nào.

## Cross-domain dependencies

- **← Orders**: `approveOrder` seed toàn bộ tầng LSX. Không có đường nào khác tạo LSX.
- **→ Orders**: duyệt LSX là con đường **duy nhất** đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`.
- **← Inventory**: chỉ đọc, qua `getStockLevels` với tham số `excludeOrderId`. Domain này **không ghi** gì vào sổ kho.
- **← Product Structure**: đọc `routing_steps` (Cấp 0) và `bom_items` **một lần**, trong transaction
  duyệt LSX, để copy sang `production_job_steps`/`production_job_materials`. Ngoài thời điểm đó
  không đọc lại — sửa routing/BOM sau khi đã duyệt không ảnh hưởng Job đã có. Job vẫn chưa chia
  tiến độ theo công đoạn.

## Common mistakes

1. **Đi tìm cách biết Job "đã xong" qua API.** Không tồn tại — hệ thống hiện không ghi nhận sản
   lượng đạt/phế qua route nào; `status` chỉ có 2 giá trị và không giá trị nào là điểm cuối.
2. **Tưởng duyệt LSX sẽ trừ kho.** Không lập phiếu xuất kho nào — tồn chỉ đổi khi có người lập phiếu tay.
3. **Tưởng "Đề xuất SX" là số liệu sống.** Là snapshot lúc duyệt; mở lại màn chi tiết không tính lại.
4. **Quên `excludeOrderId` khi tính Khả dụng cho một PO** → trừ nhu cầu của chính nó hai lần.
5. **Tưởng Job map 1-1 với dòng đơn hàng.** Job gộp theo sản phẩm; dòng quyết định sản xuất mới là tầng 1-1.
6. **Tìm log thao tác của Job.** Không tồn tại — chỉ LSX có log.
7. **Tưởng có thể huỷ duyệt LSX.** `APPROVED` hiện là điểm cuối, chưa có route đưa về `PENDING`.
8. **Tưởng sửa routing/BOM của sản phẩm sẽ cập nhật công đoạn/vật tư của Job đã duyệt.** Cả hai đều
   là bản copy đóng băng tại thời điểm duyệt, không đọc lại nguồn.
9. **Tưởng `requiredQty`/`unitQty` là BOM explosion.** Vẫn chỉ là tổng thô theo vật tư (`SUM`),
   không nhân qua số lượng của node WIP cha — kế thừa nguyên giới hạn của
   `GET /products/:id/bom/materials`.
10. **Tìm route sửa/thêm/xoá vật tư của Job.** Chưa có — tạm hoãn, dự kiến mở rộng sau này.

## Related docs

- `docs/workflows/production-order-approval.md`, `docs/workflows/production-job-execution.md` —
  trình tự chạy của hai chặng.
- `docs/domains/orders.md` — điều kiện để một đơn tới được đây.
- `docs/domains/inventory.md` — nguồn `onHand`/`reserved`.
