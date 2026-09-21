# Gộp tiến độ nhận hàng OS-OUT vào `status` (BUG-094)

**Trạng thái:** còn hiệu lực

## Bối cảnh

QA báo BUG-094: danh sách/chi tiết OS-OUT chỉ còn hiện `status` DB thô (2 giá trị lúc đó —
`POSTED`/`CANCELLED`), mất khả năng theo dõi tiến độ nhận hàng (đang gia công/về 1 phần/chờ QC/hoàn
thành) mà FE đã dựng sẵn badge/label từ trước nhưng không có dữ liệu để hiện. Khảo sát git history
xác nhận: một trường `progress` tính-lúc-đọc (enum riêng, không lưu cột) từng tồn tại đầy đủ, bị xoá
sạch trong một refactor lớn không liên quan (`4946501`, 18/08/2026) — tác dụng phụ không nêu trong
commit message, không có quyết định nào ghi lại lý do xoá.

## Hai hướng đã cân nhắc

1. **Derive lúc đọc** (khuôn `purchase-orders.PurchaseOrderProgress`) — không đổi schema, tính
   `progress` mỗi lần `GET`, JOIN thêm 3 subquery (SL gửi/SL nhận/IQC còn treo). Ưu điểm: không cần
   ghi thêm ở đâu, không risk migration. Nhược điểm đã chỉ ra khi trình bày: nhiều chỗ code khác
   trong repo (`E171`, `E169`, filter theo `status`, báo cáo trễ hạn) đang đọc `status` với đúng
   nghĩa "trạng thái chứng từ" (2 giá trị) — nếu gộp tuỳ tiện sẽ vỡ, nên bản derive giữ 2 khái niệm
   `status`/`progress` tách biệt để không đụng các chỗ đó.
2. **Lưu thẳng vào `status`** (chọn) — mở rộng `outsourcing_order_status` từ 2 lên 5 giá trị, không
   còn khái niệm `progress` tách riêng. Đổi lấy: đơn giản hơn ở toàn bộ phía đọc (list/detail không
   còn JOIN 3 subquery, không cần `resolveOrderProgress`/`buildProgressCondition` mỗi lần gọi), phải
   sửa 6 chỗ code đang so `status === POSTED` (một trong số đó — gate nhận hàng `E171` — sẽ **chặn
   nhầm** đợt nhận hàng thứ 2 của cùng phiếu nếu sửa sai thành so `=== POSTED` thay vì `!==
   CANCELLED`), và cần 3 điểm ghi gọi `recomputeOutsourcingOrderStatus` đúng lúc.

Chọn hướng 2 theo yêu cầu — sau khi thiết kế lại kỹ, hướng này thật ra đơn giản hơn hướng 1 xét tổng
thể (đọc đơn giản đi nhiều hơn phần ghi phức tạp thêm), và khớp trực giác "status của 1 phiếu chỉ
nên có 1 nguồn sự thật" hơn là 2 field song song dễ đọc nhầm cái nào là "thật".

## Quyết định

`outsourcing_orders.status` (`OutsourcingOrderStatus`,
`src/database/schemas/inventory/outsourcing-orders.ts`) mở rộng từ `POSTED`/`CANCELLED` thành 5 giá
trị:

| Giá trị | Nghĩa | Ai ghi |
| --- | --- | --- |
| `SENT` | Đã gửi, chưa nhận được dòng nào | `createOutsourcingOrder` (default lúc tạo) |
| `PARTIAL` | Đã nhận 1 phần, còn dòng chưa đủ | `recomputeOutsourcingOrderStatus` |
| `WAITING_QC` | Đã nhận đủ, còn IQC chưa `COMPLETED` | `recomputeOutsourcingOrderStatus` |
| `COMPLETED` | Đã nhận đủ, không còn IQC treo | `recomputeOutsourcingOrderStatus` |
| `CANCELLED` | Đã huỷ | `cancelOutsourcingOrder` |

**`recomputeOutsourcingOrderStatus`** (`outsourcing-orders.query.ts`, hàm thuần export, không qua
NestJS DI) là nguồn ghi duy nhất cho 3 giá trị `PARTIAL`/`WAITING_QC`/`COMPLETED` — tính lại từ dữ
liệu thật (Σ SL gửi/nhận + còn IQC treo không) rồi `UPDATE`, bỏ qua nếu phiếu đã `CANCELLED`. Gọi từ
3 điểm — đúng những nơi 1 trong 3 dữ kiện đầu vào của nó vừa đổi:

1. `OutsourcingReceiptsService.createOutsourcingReceipt` — SL nhận tăng (gọi cho từng OS-OUT bị ảnh
   hưởng, 1 phiếu OS-IN có thể gộp nhiều OS-OUT).
2. `OutsourcingReceiptsService.cancelOutsourcingReceipt` — SL nhận giảm lại.
3. `IqcService.confirmIqc` — IQC treo có thể vừa hết (hoặc vẫn còn), chỉ khi
   `originType = OUTSOURCING_RECEIPT_ITEM`.

`createOutsourcingOrder`/`cancelOutsourcingOrder` **không** gọi hàm này — 2 giá trị đầu/cuối vòng
đời (`SENT`/`CANCELLED`) ghi thẳng, không cần tính lại.

## 6 chỗ code đọc `status === POSTED` đã sửa thành `status !== CANCELLED`

`OutsourcingReceiptsService.ensureOrderItemValid` (gate `E171`, tạo OS-IN),
`OutsourcingReceiptsService.getPendingOrderItems` (picker "còn được nhận"),
`OutsourcingOrdersService.cancelOutsourcingOrder` (gate check active receipts trước khi huỷ),
`outsourcing-orders.query.ts#sentQuantityByJobOperationSubquery` (SL đã gửi cho popup chọn part).
`ReportsService.outsourcingOrderDuePassed` đổi khác — không còn cần so `POSTED` + JOIN SL gửi/nhận,
đọc thẳng `status IN (SENT, PARTIAL)` (còn treo).

## Data migration

Mọi dòng `status = POSTED` tại thời điểm migrate được backfill theo đúng logic
`recomputeOutsourcingOrderStatus` (không mặc định `SENT` cho tất cả) — xem migration
`drizzle/<timestamp>_*.sql` phần `UPDATE` viết tay thêm vào sau khi `db:generate` đổi enum.

## Đừng hoàn lại

- Đừng so `status === POSTED` ở bất kỳ đâu — `POSTED` không còn là giá trị hợp lệ. Dùng `!==
  CANCELLED` cho "còn hoạt động", hoặc liệt kê rõ tập giá trị cần (`inArray`) khi cần phân biệt tinh
  hơn (VD báo cáo trễ hạn chỉ tính `SENT`/`PARTIAL`, không tính `WAITING_QC`/`COMPLETED`).
- Đừng gọi `recomputeOutsourcingOrderStatus` ngoài transaction của thao tác vừa gây thay đổi — luôn
  cùng `tx`, không phải cron/job nền riêng.
- Đừng tưởng gộp 2 khái niệm là luôn đúng — chỉ đúng ở đây vì đã kiểm hết mọi call site phụ thuộc
  `status` trước khi gộp (xem bảng 6 chỗ ở trên). Một trường DB status khác đang được đọc như gate
  nghiệp vụ ở nhiều nơi thì phải kiểm lại y hệt trước khi tính chuyện gộp.

## Related docs

`docs/decisions/outsourcing-no-draft.md` (quyết định trước — bỏ DRAFT, không đụng gì tới quyết định
này). `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`.
