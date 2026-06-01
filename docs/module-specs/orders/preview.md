# Orders Preview

## Commercial List

Route:

```text
/manage/orders
```

Columns:

```text
Khách hàng | PO | PR | Ngày giao | Trạng thái | Tổng tiền | VAT | Tổng sau VAT | Thao tác
```

Toolbar actions:

```text
[+ Tạo đơn] [Tìm kiếm] [Lọc trạng thái]
```

## Create/Edit Order Form

Fields:

```text
Khách hàng
PO code
PR number
Ngày giao hàng
VAT rate
Ghi chú
Dòng thành phẩm
PO PDF
```

Line item behavior:

- Product selection uses `GET /orders/product-options`.
- Product name, default sale price, and technical files auto-fill from the product option.
- Unit and quantity are editable.
- Line total and order totals are calculated in UI for preview and recalculated by backend on save.

## Approval Detail

Rules:

- Director/Admin can approve or reject pending orders.
- Reject requires a reason.
- Business can edit/delete pending or rejected orders.
- Approved orders are read-only.

## Production View

Rules:

- Production uses `/orders/production` APIs.
- Financial columns and PO PDF are not rendered.
- Product technical files are visible on order lines.
