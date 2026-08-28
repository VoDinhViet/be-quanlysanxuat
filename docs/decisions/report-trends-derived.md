# KPI báo cáo: trend tính lúc đọc, không lưu lịch sử

**Trạng thái:** còn hiệu lực

## Bối cảnh

`GET /reports/stats` trả 6 nhóm KPI cho trang Bảng điều khiển, mỗi nhóm kèm một con số "so với
hôm qua/tuần trước". Hệ thống không có bảng lịch sử trạng thái cho `orders`/`production_jobs`/
`qc_requests` — mọi trạng thái là "hiện tại", không có bản ghi "trạng thái tại thời điểm X".

## Quyết định

Trend tính lúc đọc bằng cách so filter hiện tại với cùng filter cộng thêm điều kiện thời gian (ví
dụ `overdueOrdersTrendCount` = số đơn trễ hôm nay trừ số đơn trễ tính đến hôm qua) — cùng khuôn với
`OrdersService.getOrderStats.expiredTrendCount` (`src/api/orders/orders.service.ts`). Không thêm
bảng snapshot, không thêm cron.

Hệ quả chấp nhận trước: vì base luôn là tập con của tập hiện tại (mọi trạng thái đang xét đều "một
chiều" hoặc gần như vậy — đơn đã duyệt không quay lại chưa duyệt, Job đã `IN_PROGRESS` không quay
lại `PENDING`), delta gần như luôn **≥ 0**. Các thẻ KPI sẽ hầu như không bao giờ hiển thị mũi tên
giảm thật sự, kể cả khi số liệu nghiệp vụ thực tế đã giảm (đơn bị huỷ, NCR đã xử lý xong) — vì phần
"đã đóng" biến mất khỏi cả hai vế phép trừ, không để lại dấu vết.

**Ngoại lệ — `openNcrTrendCount`:** đây là trend duy nhất *không* theo quy tắc "base là tập con"
ở trên. `ReportsService.getQcSummary` dựng lại số NCR đang mở **tại một thời điểm quá khứ** bằng
cách dò `qc_inspections.resultingStatus` (trạng thái request nhận ngay sau mỗi attempt, append-only
nên giữ được lịch sử thật) của attempt gần nhất trước mốc đó, rồi trừ cho số hiện tại. Vì một NCR có
thể đã đóng (`COMPLETED`) từ lúc đó đến nay, delta này **có thể âm** — cố ý, để FE hiện được mũi tên
giảm khi NCR tồn đọng thực sự giảm. Đây là mẫu để tham khảo nếu sau này muốn làm chính xác thêm cho
các trend khác — không cần bảng snapshot, chỉ cần dò lại lịch sử qua bảng attempt append-only đã có
sẵn (không áp dụng được cho `orders`/`production_jobs` vì hai bảng đó không có bảng lịch sử tương
đương `qc_inspections`).

## Lọc theo khoảng ngày (`startDate`/`endDate`)

Mỗi nhóm KPI lọc thêm theo đúng 1 cột "mốc ngày" của domain nó (PO đang chạy → `approvedAt`; PO trễ
hạn/PO sắp giao → `dueDate`, dùng chung; Job đang sản xuất → `startedAt`; Chờ QC/NCR chưa xử lý →
`qcRequests.createdAt`, dùng chung) — **giao** với điều kiện trạng thái sẵn có, không thay thế.

Khi có filter, **mọi field trend/window trả `null`** (không tính lại "so với X ngày trước filter")
— quyết định có chủ ý: so với "hôm qua"/"tuần trước" không còn ý nghĩa rõ ràng khi người dùng đang
xem một khoảng ngày tuỳ chọn trong quá khứ; thêm một định nghĩa trend thứ hai chỉ cho trường hợp có
filter sẽ làm response khó đoán hơn là hữu ích hơn.

## Đừng hoàn lại

Nếu sau này cần mũi tên giảm chính xác (VD báo cáo điều hành cần biết NCR tuần này ít hơn tuần
trước), thiết kế đúng là thêm bảng snapshot (`report_kpi_snapshots` hoặc tương tự) + một job định kỳ
ghi lại các con số mỗi ngày, rồi trend là hiệu giữa hai snapshot — không phải cố nặn thêm ra từ
trạng thái hiện tại, vì thông tin "đã đóng lúc nào" đơn giản là không tồn tại trong schema hiện tại.

## Related docs

`docs/domains/orders.md`, `docs/domains/production.md`, `docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md` — mỗi trạng thái
dùng trong `reports` được định nghĩa đầy đủ ở đó, module `reports` chỉ đọc lại.
