# Tài liệu be-quanlysanxuat

Backend NestJS 11 quản lý sản xuất (ERP nhỏ): bán hàng, sản xuất, mua hàng, kho, chất lượng, gia công ngoài. Tài liệu này viết từ code hiện tại (tháng 10/2026), thay cho bộ `docs/` cũ đã xoá ở commit `9d1f7ca`.

Quy ước chung (lệnh chạy, quy tắc viết code, cảnh báo database) nằm ở [CLAUDE.md](../CLAUDE.md) và `.claude/rules/`. Thư mục này chỉ nói về **hệ thống làm gì và vì sao**.

## Mục lục

| Part | File | Phạm vi (thư mục `src/api/...`) | Trạng thái |
|---|---|---|---|
| 0 | [architecture.md](architecture.md) | Request pipeline, cấu trúc module, mã chứng từ, lỗi, lưu trữ | Xong |
| 1 | [domains/identity-access.md](domains/identity-access.md) | auth, users, roles, departments, positions | Xong |
| 2 | domains/master-data.md | clients, client-groups, suppliers, supplier-groups, items, item-units, units, countries, files, operations, routings, boms, bom-operations, bom-directs | Chưa viết |
| 3 | domains/sales.md | orders, outbound-orders | Chưa viết |
| 4 | domains/production.md | production-orders, production-jobs, production-execution | Chưa viết |
| 5 | domains/purchasing.md | purchase-requests, purchase-quotations, purchase-orders, purchase-notes, purchase-ledger, payment-requests | Chưa viết |
| 6 | domains/inventory.md | inventory, inventory-receipts, inventory-issues, inventory-requisitions, inventory-adjustments, inventory-directs, inventory-products, supplier-returns | Chưa viết |
| 7 | domains/quality.md | iqc, oqc | Chưa viết |
| 8 | domains/outsourcing.md | outsourcing-orders, outsourcing-receipts | Chưa viết |
| 9 | domains/reports.md | reports, health | Chưa viết |

## Thuật ngữ

| Viết tắt | Nghĩa |
|---|---|
| SO / PO | Đơn hàng bán (mã nội bộ) / số PO của khách hàng |
| LSX | Lệnh sản xuất |
| Job | Một việc sản xuất của một thành phẩm trong LSX |
| BOM | Cấu trúc vật tư của thành phẩm |
| DMH | Đơn mua hàng (mã `DMH-xxxxx`) |
| PR | Đề xuất mua hàng |
| RFQ | Báo giá nhà cung cấp |
| IQC / OQC | Kiểm tra chất lượng đầu vào / đầu ra |
| NCR | Phiếu không phù hợp |
| FG / DIRECT | Loại item: thành phẩm / vật tư trực tiếp (`ItemType`) |
| TTT / TKD | Tồn thực tế / tồn khả dụng |
| YCTT | Yêu cầu thanh toán |
