# Khôi phục điểm kết thúc cho Job/LSX/Order/DO

**Trạng thái:** còn hiệu lực — đảo một phần quyết định cũ (`0068`/`0071`, 2026-07-31: rút
`production_job_status` từ 5 xuống 2 giá trị, bỏ `COMPLETED`/`CANCELLED`) và khép lại "phase giao
hàng 2" từng để ngỏ (`docs/decisions/qc-gates-on-stock-moves.md`, mục "Phạm vi cố ý hẹp của gate D2").

## Bối cảnh

Trước đợt này, hệ thống không đóng được vòng đời chứng từ: `order_status`/`outbound_order_status`
đã khai sẵn `COMPLETED`/`DELIVERED` nhưng không route nào gán; `production_order_status`/
`production_job_status` không có giá trị kết thúc nào cả. Dữ liệu thật xác nhận — một đơn giao đủ
100% (DO đã xác nhận, phiếu xuất kho SALES đã `POSTED`) vẫn đứng nguyên ở `order=IN_PROGRESS,
LSX=APPROVED, Job=IN_PROGRESS, DO=PENDING_DELIVERY` vĩnh viễn. Hệ quả: thẻ "đơn hoàn thành" và báo
cáo doanh thu ghi nhận luôn bằng 0, quản đốc không biết Job nào xong, kho không biết DO nào đã giao,
không chốt được kỳ.

Đây không phải tính năng cố ý chưa làm — `docs/domains/inventory.md` (mục "Giao hàng") đã ghi sẵn
đúng thiết kế "phase giao hàng 2" (DO có bước xác nhận giao thật thì tự sinh + post 1
`inventory_issues` SALES), chỉ chưa từng implement. `production_job_status` từng có 5 giá trị, bị
rút bớt vì "xưởng chưa cần" — `docs/decisions/stored-inventory-balances.md` đã cảnh báo trước đây là
chặn kỹ thuật cho việc auto-post kho từ sản xuất.

Một phát hiện thêm khi kiểm chứng: phiếu xuất kho SALES tạo tay hiện tại (quy trình cũ, tách rời
`outbound-orders`) không gắn `orderItemId`, nên công thức "SL đã giao"
(`issuedQuantityByOrderItemIdSubquery`, dựa `inventory_transactions.order_item_id`) không nhận ra
được lần giao hàng thật đó — đây là lý do kỹ thuật chính khiến phải tự sinh phiếu xuất trong
`postOutboundOrder` thay vì dựa vào quy trình thủ công sẵn có.

## Quyết định

Hai nhánh đóng vòng đời **độc lập nhau**, không có quan hệ 1:1 giữa chúng:

```
Job:  PENDING → IN_PROGRESS → WAITING_QC → WAITING_DELIVERY → COMPLETED → (mọi Job cùng LSX
      COMPLETED) → LSX COMPLETED
DO:   DRAFT → PENDING_DELIVERY → DELIVERED (OutboundOrdersService.postOutboundOrder) → (mọi
      order_item NORMAL của đơn liên quan đã issuedQty ≥ quantity) → Order COMPLETED
```

**Nhánh production** (`ProductionJobStatus` thêm `WAITING_QC`/`WAITING_DELIVERY`/`COMPLETED`,
`ProductionOrderStatus` thêm `COMPLETED`) — tất cả tự động, không route tay:

- `IN_PROGRESS → WAITING_QC`: `ProductionJobsService.updateProductionJobOperation`, ngay khi công
  đoạn Cấp 0 (FG) đạt `completedQuantity >= planned` — `E210` đã đảm bảo mọi công đoạn khác xong
  trước đó rồi.
- `WAITING_QC → WAITING_DELIVERY`: `OqcService.confirmOqc`, khi `getJobQcCoverage` báo `open = 0`
  sau lần confirm — tái dùng đúng gate đã có (`E196`/`E205`), không dựng cơ chế mới.
- `WAITING_DELIVERY → COMPLETED`: `InventoryReceiptsService.postInventoryReceipt`
  (`receiptType = PRODUCTION`), khi tổng SL đã nhập kho (`getConfirmedProductionQuantityByJobId`)
  đạt `job.quantity` — đúng ngưỡng gate `E197` đã chặn từ trước, giờ dùng luôn để đóng Job.
- Cascade LSX: Job cuối cùng của LSX đạt `COMPLETED` → LSX tự đóng `COMPLETED`, ghi 1 dòng
  `production_order_logs` (`action = COMPLETED`).
- Ghi thẳng bằng drizzle ở cả 2 module ngoài (`oqc`, `inventory-receipts`) — không gọi qua
  `ProductionJobsService`/`ProductionOrdersService` để tránh vòng import
  (`production-jobs`/`production-orders` đã import `oqc`/không import các module kia theo chiều
  ngược lại).

**Nhánh delivery** (`OutboundOrdersService.postOutboundOrder`, route `POST
/outbound-orders/:id/deliver`) — `PENDING_DELIVERY → DELIVERED`:

- Tự sinh 1 `inventory_issues` (`issueType = SALES`, `status = POSTED` thẳng) từ đúng các dòng của
  DO, gắn `orderItemId` đúng (khắc phục lỗ hổng nêu ở Bối cảnh), rồi `InventoryPostingService.
  postDocument` trừ tồn thật — tất cả trong cùng transaction với việc đổi `outboundOrders.status`.
  Không gọi qua `InventoryIssuesService.createInventoryIssue`/`postInventoryIssue` vì cả hai tự mở
  transaction riêng, không nhận `tx`.
- Sau khi trừ tồn, với mỗi đơn hàng bị đụng bởi lô hàng vừa giao (1 DO có thể gộp nhiều đơn cùng
  khách): mọi dòng `order_items` còn `NORMAL` đã `issuedQty >= quantity` → đơn đó tự đóng
  `COMPLETED`. Chỉ đóng đơn đang `IN_PROGRESS`.
- **Tên hàm `postOutboundOrder`, không phải `deliverOutboundOrder`** — mượn động từ kế toán ERP
  chuẩn "post" (ghi sổ) cho đúng bản chất kỹ thuật (sinh + ghi bút toán kho), dù trạng thái DO đích
  là `DELIVERED` chứ không phải `POSTED` (DO không có trạng thái đó). Route path vẫn `/deliver` —
  đúng ngôn ngữ nghiệp vụ người dùng thấy ("Xác nhận đã giao").

## Vì sao Job không đóng theo DO cụ thể của nó

Tồn kho thành phẩm là fungible — không có ràng buộc 1:1 giữa một Job và một DO
(`outbound_order_items.productionJobId` chỉ là snapshot hiển thị, service-enforced là **không** dùng
để validate). Một Job có thể cấp hàng cho nhiều DO qua nhiều lần xuất khác nhau, và một DO có thể
gộp hàng vốn xuất phát từ nhiều Job khác nhau. Vì vậy Job đóng theo tiến độ **sản xuất của chính nó**
(QC xong + nhập kho đủ), không chờ "đơn hàng của nó" giao xong — hai khái niệm tách biệt hoàn toàn.

## Kho xuất cho phiếu SALES tự sinh — tự resolve, không thêm cột

`outbound_orders`/`outbound_order_items` không có cột kho (comment cũ trên schema nói "kho xuất suy
từ dòng" nhưng `order_items` cũng không có cột kho — đường suy đó chưa từng tồn tại). Đã hỏi user,
chọn: `postOutboundOrder` tự tìm kho `type = FG` — đúng 1 kho (thực tế hiện chỉ có `KHO-TP`) thì
dùng, khác 1 thì ném `E238` thay vì đoán. Không thêm cột `warehouseId`/không đổi DTO tạo DO/không
đụng FE — nếu sau này có ≥ 2 kho FG thật, đó là lúc thêm cột tường minh, không phải bây giờ.

## Giữ nguyên, không đổi

- `orders.status = COMPLETED` vẫn có thể set tay qua `PATCH /orders/:id` (`ensureStatusSettable`
  không chặn `COMPLETED`) — nhánh tự động ở trên là **bổ sung**, không thay thế đường tay đã có.
- Job/LSX chưa có trạng thái huỷ (`CANCELLED`) — không nằm trong yêu cầu lần này, chỉ thêm điểm kết
  thúc thành công.
- `WAITING_OUTSOURCE`/"Chờ OS" **không** thêm vào `order_status` — outsourcing là khái niệm ở mức
  Job/công đoạn (`outsourcing_orders`), không phải Order; không khớp lifecycle nào tìm được.

## Đừng hoàn lại

- Đừng rút `production_job_status`/`production_order_status` về lại 2 giá trị như `0068`/`0071` đã
  làm — lý do "xưởng chưa cần" không còn đúng, các trạng thái này giờ là điều kiện đóng vòng đời
  thật, không phải tính năng thừa.
- Đừng thay `postOutboundOrder` tự sinh phiếu SALES bằng cách quay lại quy trình tạo tay tách rời —
  đó chính là lỗ hổng đã sửa (phiếu tạo tay không gắn `orderItemId`, làm "SL đã giao" sai vĩnh viễn).

## Related docs

`docs/domains/production.md` (Lifecycle Job/LSX), `docs/domains/inventory.md` (mục "Giao hàng"),
`docs/domains/orders.md` (Lifecycle, Common mistakes #5), `docs/workflows/final-qc.md`,
`docs/workflows/production-job-execution.md`, `docs/decisions/qc-gates-on-stock-moves.md` (gate D2,
nay đã có `DELIVERED`), `docs/decisions/stored-inventory-balances.md` (cảnh báo blocker cũ).
