# Đổi thuật ngữ CONSUMABLE → DIRECT

Vật tư (`items.type`, `bom_items.type`, `production_job_bom_items.item_type`) từng gọi là `CONSUMABLE`
(`docs/decisions/material-to-consumable-rename.md`), nay gọi là **`DIRECT`**. Đổi toàn bộ, không giữ alias:
giá trị enum, `upload_type` (`DIRECT_IMAGE`/`DIRECT_DOCUMENT`), cột `items.direct_grade`,
`DocumentType.ITEM_DIRECT`, module `bom-directs`/`inventory-directs` (route `.../directs`, `/inventory-directs`),
khoá lỗi `*_direct*` và tên hàm/biến/kiểu tương ứng. Chữ hiển thị "Vật tư" không đổi.

Migration `0205_consumable_to_direct_rename.sql` viết tay bằng `RENAME VALUE` (không `ADD VALUE` song song hai
nhãn) và dựng lại 3 CHECK tường minh.

**Đọc các decision/migration cũ:** mọi chỗ ghi `CONSUMABLE` trong `docs/decisions/*` và `drizzle/*.sql` cũ là
lịch sử — đọc thành `DIRECT`. Đừng thêm lại nhãn `CONSUMABLE` hay giữ cả hai nhãn trong một enum.
