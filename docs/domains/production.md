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
| `production_order_logs` | Lịch sử thao tác **ở mức LSX** (append-only) |

Job **không có** log thao tác — cố ý bỏ. Không có cách nào qua API biết ai/khi nào đã báo sản lượng hay chuyển chờ; chỉ `startedBy`/`startedAt` được ghi thật.

## Lifecycle

**LSX** — một chiều, chưa có đường lùi:

```
PENDING (kế hoạch, sửa số lượng tự do) ──approve──> APPROVED (chốt, sinh mã LSX + sinh Job)
```

**Job** — ba trạng thái, **không có điểm kết thúc**:

```
PENDING ──start──> IN_PROGRESS ──hold──> WAITING
                        ▲                   │
                        └─────resume────────┘
        report: cộng dồn sản lượng, không đổi trạng thái
```

Đây là điểm dễ bất ngờ nhất: một Job **báo đủ số lượng vẫn đứng ở `IN_PROGRESS`**. Không có route nào đánh dấu Job "đã xong". Xưởng chỉ cần ba trạng thái hiển thị nên hai trạng thái kết thúc đã bị bỏ.

Hệ quả cho cảnh báo trễ hạn: không được dùng `status` để xét "chưa xong" — phải so trực tiếp số lượng (`producedQty + rejectedQty < quantity`).

## Business rules

- Duyệt LSX chỉ hợp lệ khi LSX đang `PENDING` **và** đơn gốc vẫn `AWAITING_PRODUCTION`.
- Duyệt LSX làm ba việc trong **một** transaction: chốt LSX (+ sinh mã), đẩy đơn sang `IN_PROGRESS`, sinh Job cho mọi sản phẩm có SL > 0.
- Sửa số lượng sản xuất là **partial** (chỉ dòng gửi lên bị ghi), chỉ khi LSX còn `PENDING` (`E084`), và chỉ tính lại `fromStockQty` — **không** refresh tồn kho.
- LSX không có sản phẩm nào SL > 0 → duyệt xong **không có Job nào**, không phải lỗi.
- **Báo sản lượng cộng dồn, không ghi đè**: hai lần báo 10 thành 20. Tổng không được vượt `quantity` (`E088`); phải có ít nhất một giá trị > 0 (`E089`).
- Một đơn bị từ chối rồi duyệt lại sẽ **ghi đè hoàn toàn** hồ sơ LSX cũ — không cộng dồn, không giữ lịch sử các lần duyệt.

## Invariants

- Một đơn hàng có tối đa một LSX (`orderId` unique).
- Một sản phẩm có tối đa một Job trong một LSX.
- Job chỉ sinh ra từ transaction duyệt LSX — **không có route tạo Job trực tiếp**.
- `quantity` của Job luôn > 0 (DB CHECK) — sản phẩm SL 0 không sinh Job.
- LSX `APPROVED` thì mã `LSXxxxx` và `approvedAt` cùng có; `PENDING` thì cả hai cùng NULL (DB CHECK).
- Đã có LSX `APPROVED` thì dòng `items` của đơn gốc không sửa được nữa (`E080`).

Không phải invariant dù dễ tưởng:

- **Không có chốt chặn tồn kho tổng hợp.** Hai dòng đơn khác nhau cùng một sản phẩm tính "Lấy từ tồn" độc lập trên cùng một con số Khả dụng — cộng lại có thể vượt tồn thực tế. Đã cân nhắc, cố ý để ngoài phạm vi.
- **Duyệt LSX không lập phiếu xuất kho.** Phần "Lấy từ tồn" hiện **không** sinh chứng từ kho nào.

## Cross-domain dependencies

- **← Orders**: `approveOrder` seed toàn bộ tầng LSX. Không có đường nào khác tạo LSX.
- **→ Orders**: duyệt LSX là con đường **duy nhất** đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`.
- **← Inventory**: chỉ đọc, qua `getStockLevels` với tham số `excludeOrderId`. Domain này **không ghi** gì vào sổ kho.
- **← Product Structure**: chỉ dùng `products.id` + số lượng. **Không đọc BOM, không đọc routing** — Job chưa chia theo công đoạn.

## Common mistakes

1. **Dùng `status` của Job để biết "đã xong".** Bộ ba trạng thái không có điểm cuối; phải so số lượng.
2. **Tưởng duyệt LSX sẽ trừ kho.** Không lập phiếu xuất kho nào — tồn chỉ đổi khi có người lập phiếu tay.
3. **Tưởng "Đề xuất SX" là số liệu sống.** Là snapshot lúc duyệt; mở lại màn chi tiết không tính lại.
4. **Quên `excludeOrderId` khi tính Khả dụng cho một PO** → trừ nhu cầu của chính nó hai lần.
5. **Tưởng Job map 1-1 với dòng đơn hàng.** Job gộp theo sản phẩm; dòng quyết định sản xuất mới là tầng 1-1.
6. **Tìm log thao tác của Job.** Không tồn tại — chỉ LSX có log.
7. **Tưởng có thể huỷ duyệt LSX.** `APPROVED` hiện là điểm cuối, chưa có route đưa về `PENDING`.

## Related docs

- `docs/features/production.md` — API contract, error code, mô hình dữ liệu chi tiết.
- `docs/domains/orders.md` — điều kiện để một đơn tới được đây.
- `docs/domains/inventory.md` — nguồn `onHand`/`reserved`.
