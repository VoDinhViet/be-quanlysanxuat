# Khôi phục điểm kết thúc cho Job/LSX/Order/DO

**Trạng thái:** còn hiệu lực — đảo một phần quyết định cũ (rút `production_job_status` từ 5 xuống 2
giá trị, bỏ `COMPLETED`/`CANCELLED`) và khép lại "phase giao hàng 2" từng để ngỏ
(`docs/decisions/qc-gates-on-stock-moves.md`, mục "Phạm vi cố ý hẹp của gate D2"). 2026-09-03: đảo
nốt phần còn lại của cùng đợt "simplify Job lifecycle" — khôi phục `production_job_logs` (mục cùng
tên bên dưới).

## Bối cảnh

Trước đợt này, hệ thống không đóng được vòng đời chứng từ: `order_status`/`outbound_order_status`
đã khai sẵn `COMPLETED`/`DELIVERED` nhưng không route nào gán; `production_order_status`/
`production_job_status` không có giá trị kết thúc nào cả. Dữ liệu thật xác nhận — một đơn giao đủ
100% (DO đã xác nhận, phiếu xuất kho SALES đã `POSTED`) vẫn đứng nguyên ở `order=IN_PROGRESS,
LSX=APPROVED, Job=IN_PROGRESS, DO=PENDING_DELIVERY` vĩnh viễn. Hệ quả: thẻ "đơn hoàn thành" và báo
cáo doanh thu ghi nhận luôn bằng 0, quản đốc không biết Job nào xong, kho không biết DO nào đã giao,
không chốt được kỳ.

Đây không phải tính năng cố ý chưa làm — thiết kế "phase giao hàng 2" (DO có bước xác nhận giao
thật thì tự sinh + post 1 `inventory_issues` SALES) đã được vạch sẵn từ trước, chỉ chưa từng
implement — nay là `docs/workflows/outbound-delivery.md`. `production_job_status` từng có 5 giá trị, bị
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
DO:   DRAFT → (send) → PENDING_APPROVAL → (approve) → PENDING_DELIVERY → DELIVERED
      (OutboundOrdersService.postOutboundOrder) → (mọi order_item NORMAL của đơn liên quan đã
      issuedQty ≥ quantity) → Order COMPLETED
```

**Nhánh production** (`ProductionJobStatus` thêm `WAITING_QC`/`WAITING_DELIVERY`/`COMPLETED`,
`ProductionOrderStatus` thêm `COMPLETED`) — tất cả tự động, không route tay:

- `(tạo Job)`/`PENDING → IN_PROGRESS`: `ProductionJobsService.createJobs`/`startJob` — không tự
  động (route tay `start`), nhưng cùng ghi 1 dòng `production_job_logs` (`CREATED`/`STARTED`) như
  3 mốc tự động dưới đây, xem mục "`production_job_logs` khôi phục 2026-09-03".
- `IN_PROGRESS → WAITING_QC`: `ProductionExecutionService.createJobOperationReport`
  (`recomputeOutsourcedOperationProgress` cũng gọi lại cho nhánh OS-IN), khi node Cấp 0
  (FG) **không còn công đoạn nào dở** — đếm lại cả node sau mỗi lần ghi, không suy từ một công đoạn
  vừa báo (node Cấp 0 có thể nhiều bước). `E210` đã đảm bảo mọi công đoạn
  khác (ngoài Cấp 0) xong trước đó rồi. Ghi 1 dòng `production_job_logs` (`WAITING_QC`) khi UPDATE
  thực sự đổi trạng thái.
- `WAITING_QC → WAITING_DELIVERY`: `closeJobIfQcCovered` (`src/api/oqc/oqc.query.ts`), khi
  `getJobQcCoverage` báo `open = 0` — tái dùng đúng gate đã có (`E196`/`E205`), không dựng cơ chế
  mới. `getJobQcCoverage` gộp chung IQC/OQC (`docs/decisions/qc-data-model.md`), nên hàm này được
  gọi từ **ba** nơi có thể đưa dòng QC cuối cùng của Job về `COMPLETED`: `OqcService.confirmOqc`,
  `IqcService.confirmIqc`, và `completeIqcAfterSupplierReturn` — Job có công đoạn `OUTSOURCE` đóng
  bằng IQC (không phải OQC), thiếu một trong ba chỗ gọi thì Job kẹt vĩnh viễn ở `WAITING_QC`. Từ
  2026-08-31, điều kiện mở khoá thêm `countPendingJobOperations(...) === 0` (không còn công đoạn
  nào của Job thiếu `completedDate`) — trước đó chỉ đếm dòng QC đã đóng, nên 1 công đoạn `OUTSOURCE`
  có IQC `COMPLETED` (duy nhất dòng QC tồn tại) có thể đẩy nhầm cả Job sang `WAITING_DELIVERY` dù
  công đoạn khác còn dở, xem `docs/decisions/outsourced-operation-progress-writeback.md`. Cùng lượt
  gọi, nếu UPDATE thật sự đổi trạng thái (`.returning()` non-empty — chỉ đúng một lần trong đời Job),
  `closeJobIfQcCovered` ghi 1 dòng `production_job_logs` (`WAITING_DELIVERY`) rồi gọi tiếp
  `createProductionReceiptForJob`
  (`src/api/inventory-receipts/inventory-receipts.write.ts`) tự sinh 1 phiếu nhập TP thẳng
  `PENDING_RECEIPT` (không qua `DRAFT`) — bỏ qua im lặng nếu Job đã có phiếu `PRODUCTION` rồi
  (không sinh lại sau khi phiếu tự sinh bị xoá/huỷ). Xem `docs/domains/quality-oqc.md`.
- `WAITING_DELIVERY → COMPLETED`: `InventoryReceiptsService.postInventoryReceipt`
  (`receiptType = PRODUCTION`), khi tổng SL đã nhập kho (`getConfirmedProductionQuantityByJobId`)
  đạt `job.quantity` — đúng ngưỡng gate `E197` đã chặn từ trước, giờ dùng luôn để đóng Job. Cùng
  `tx`, ghi 1 dòng `production_job_logs` (`COMPLETED`) khi UPDATE thực sự đổi trạng thái.
- Cascade LSX: Job cuối cùng của LSX đạt `COMPLETED` → LSX tự đóng `COMPLETED`, ghi 1 dòng
  `production_order_logs` (`action = COMPLETED`).
- Ghi thẳng bằng drizzle ở cả 3 module ngoài (`oqc`, `iqc`, `inventory-receipts`) — không gọi qua
  `ProductionJobsService`/`ProductionOrdersService` để tránh vòng import
  (`production-jobs`/`production-orders` đã import `oqc`/không import các module kia theo chiều
  ngược lại).

### `production_job_logs` khôi phục 2026-09-03

Bảng này từng tồn tại (thêm cùng đợt Job có vòng đời 5 trạng thái lần đầu), bị xoá hẳn ở
`1ba98fd`/migration `0069` khi "simplify Job lifecycle" rút Job xuống 2 trạng thái — cùng commit đã
xoá `hold`/`resume`/`report` mà quyết định này (phần trên) không đảo lại. Nay dựng lại đúng khuôn
`production_order_logs` (LSX): 5 action = 5 mốc chuyển trạng thái của Job
(`CREATED`/`STARTED`/`WAITING_QC`/`WAITING_DELIVERY`/`COMPLETED`) — 2 tên đầu cố ý khác
`ProductionJobStatus` (`PENDING`/`IN_PROGRESS`) vì log ghi hành động, không ghi trạng thái đích.
Ghi trong cùng transaction với
transition, **chỉ khi UPDATE thực sự đổi trạng thái** (guard `.returning()` non-empty — thiếu guard
này thì mỗi lần hàm bị gọi lại sau khi Job đã qua mốc đó sẽ ghi trùng dòng, vì các hàm
`closeJobIf*` được gọi lại nhiều lần trong đời Job, không chỉ đúng một lần).

`performedBy` NULL có chủ đích ở `WAITING_QC`/`WAITING_DELIVERY` — dù `userId` sẵn có ở một trong
hai điểm gọi `WAITING_QC` (`createJobOperationReport`) và ở điểm gọi `WAITING_DELIVERY`
(`closeJobIfQcCovered`), vẫn ghi `null` thống nhất: 2 mốc này chính `production_jobs` cũng không có
cột `*By`/`*At` riêng (chỉ `startedBy`/`startedAt`/`completedBy`/`completedAt` là cột thật), và
`WAITING_QC` có 2 đường trigger, một trong đó (OS-IN post) không có actor người thật. `CREATED`/
`STARTED`/`COMPLETED` ghi `performedBy` thật vì có cột `*By` tương ứng làm tiền lệ.

Không backfill — Job đã tồn tại trước khi bảng này khôi phục không có log hồi tố (dữ liệu để tái
dựng thời điểm `WAITING_QC`/`WAITING_DELIVERY` không còn lưu ở đâu khác).

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
- Đừng bắt kho phải tự tạo phiếu nhập TP đầu tiên của Job bằng tay — `closeJobIfQcCovered` đã tự
  sinh thẳng `PENDING_RECEIPT` đúng lúc Job qua hết QC (không qua `DRAFT`). Tạo tay chỉ còn cần cho:
  Job đã `WAITING_DELIVERY` từ trước khi tính năng này triển khai (không backfill), nhập lại sau khi
  phiếu tự sinh bị huỷ (`hasProductionReceiptForJob` không lọc theo status nên không tự sinh lại), và
  phiếu tạo tay có sẵn từ trước lúc QC đóng coverage (tự sinh bỏ qua, phiếu tay đó vẫn phải tự
  `confirm`) — **không phải** "phiếu thứ hai trở đi" kiểu nhập từng phần: phiếu tự sinh đã chiếm đủ
  `job.quantity` ngay từ `PENDING_RECEIPT`, nên một phiếu `PRODUCTION` thứ hai thật sự sẽ đụng `E197`
  ở `confirm`.
- Đừng xoá `production_job_logs` lần nữa — lý do "xưởng chưa cần" của `1ba98fd` không còn đúng; đây
  giờ là dấu vết đọc được **duy nhất** của 2 mốc `WAITING_QC`/`WAITING_DELIVERY` (không có cột
  `*By`/`*At` nào khác lưu chúng).
- Đừng đổi `performedBy` của dòng `WAITING_QC` từ `null` sang `userId` của
  `createJobOperationReport` chỉ vì route đó đã có sẵn `@CurrentUser()` — đã cân nhắc và cố ý bỏ,
  xem "`production_job_logs` khôi phục 2026-09-03" phía trên (nhánh OS-IN vẫn không có actor
  người thật, giữ `null` thống nhất giữa 2 đường trigger).

## Related docs

`docs/domains/production.md` (Lifecycle Job/LSX), `docs/workflows/outbound-delivery.md` (vòng đời
DO đầy đủ), `docs/domains/orders.md` (Lifecycle, Common mistakes), `docs/workflows/outgoing-qc.md`,
`docs/workflows/production-job-execution.md`, `docs/decisions/qc-gates-on-stock-moves.md` (gate D2,
nay đã có `DELIVERED`), `docs/decisions/stored-inventory-balances.md` (cảnh báo blocker cũ),
`docs/decisions/outsourced-operation-progress-writeback.md` (siết thêm điều kiện công đoạn cho
`WAITING_QC → WAITING_DELIVERY`), `docs/decisions/single-warehouse.md` (bỏ hẳn khái niệm kho, gỡ
`E238`/resolve kho FG khỏi `deliver`).
