# Products Preview

## Product List

Route:

```text
/manage/products
```

Columns:

```text
Hình ảnh | Khách hàng | Mã SP | Tên | Loại | Rev | Trạng thái | Ghi chú | Thao tác
```

Toolbar actions:

```text
[+ Tạo sản phẩm] [Tìm kiếm] [Lọc]
```

Row actions:

```text
[Xem] [Sửa] [Lock/Mở khóa] [Copy] [Xóa]
```

Preview rules:

- Product image shows thumbnail when available.
- Missing image falls back to a simple icon.
- Search/filter changes should update URL state and refresh list data.
- Locked products show locked status and expose the unlock action.

## Create/Edit Product Dialog

Fields:

```text
Tải hình ảnh
Khách hàng
Mã SP
Tên
Loại
Đơn vị
Revision mặc định
Ghi chú
```

Actions:

```text
[Lưu] [X]
```

Preview rules:

- Create starts with revision `R1`.
- Edit allows updating the default/current revision number.
- Image upload uses drag/drop and validates common image formats.
- Dialog size should fit the form without feeling like a full page.

## Product Detail

Sections:

- Back button and product summary.
- Product image.
- Product metadata.
- Revision card and revision selector.
- BOM tree-grid.

Preview rules:

- Product summary should be full-width and easy to scan.
- Revision card uses a white background.
- Revision selector should use URL state and avoid blocking the page.

## BOM Tree Grid

Columns:

```text
Hình | Mã | Tên (Tree) | Loại | SL | ĐV | Routing | Action
```

Row actions:

```text
[+] [Routing] [X]
```

Preview rules:

- FG/WIP rows show add-child and routing actions.
- RM/Consumable rows do not show routing action.
- Quantity can be edited inline.
- Tree indentation must clearly show parent-child structure.
- Image click opens a larger preview.

## Add BOM Node Dialog

Fields:

```text
Loại: WIP / RM / Consumable
Mã: search product/material
Tên: auto
SL
ĐV
```

Actions:

```text
[Thêm] [X]
```

Preview rules:

- Add button appears on each valid parent node.
- Selected item should auto-fill name and unit when possible.
- Dialog validates quantity before submit.

## Routing Dialog

Columns:

```text
STT | Công đoạn | Loại | Nhà cung cấp | Ghi chú | Action
```

Actions:

```text
[Thêm công đoạn] [Lưu] [X]
```

Preview rules:

- Only FG/WIP nodes can open routing.
- Outsource steps can select a default supplier.
- Save replaces the full routing step list.
- Removing a row is local until the user saves.

## Manual Preview Checklist

- Product list loads with pagination.
- Create product succeeds and appears at the top of the list.
- Edit product updates product fields, image, and revision number.
- Lock disables product/BOM/routing mutations.
- Unlock restores edit capability.
- Copy product creates a new product with copied BOM/routing.
- Delete product removes it from active list.
- BOM add/edit/delete refreshes the tree.
- Routing save refreshes routing status in the tree.
