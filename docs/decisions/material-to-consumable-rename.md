# Đổi thuật ngữ: `Material`/`RM` → `Consumable`, `PART` → `Component`

**Trạng thái:** còn hiệu lực (2026-09).

## Bối cảnh

Hai từ trong codebase không khớp nghiệp vụ: `Material`/viết tắt `RM` (raw material) — thứ được
lãnh ra để tiêu hao trong sản xuất, từ đúng là **Consumable**; `PART` — node cấu trúc con trong cây
BOM (đặt tên ở `docs/decisions/wip-removal.md`), là *thành phần cấu tạo nên* sản phẩm, từ đúng là
**Component**. Đây là đổi tên thuần — không đổi một business rule, một quan hệ, hay một dòng dữ
liệu nào; mọi hành vi/CHECK/permission giữ nguyên 100%.

## Quyết định — bảng từ điển

| Cũ | Mới |
| --- | --- |
| `Material` / `material` (identifier) | `Consumable` / `consumable` |
| `MATERIAL` (giá trị enum `UnitScope`) | `CONSUMABLE` |
| `RM` (giá trị enum `ItemType`/`BomType`/`ProductionJobBomItemType`) | `CONSUMABLE` |
| `PART` (giá trị enum `BomType`/`ProductionJobBomItemType`) | `COMPONENT` |
| `MATERIAL_IMAGE` / `MATERIAL_DOCUMENT` (`UploadType`) | `CONSUMABLE_IMAGE` / `CONSUMABLE_DOCUMENT` |
| `ITEM_RM` / `ITEM_FG_WIP` (`DocumentType`) | `ITEM_CONSUMABLE` / `ITEM_FG` (`ITEM_FG_WIP` dọn nốt chữ WIP sót từ `wip-removal.md`) |
| Module `inventory-materials` | `inventory-consumables` (route, controller, service, DTO) |
| Cột `items.material_grade` | `items.consumable_grade` |

**Không đổi:** tiền tố mã tự sinh `VTxxxx`/`SPxxxx` (`ItemsService.generateItemCode`) — đây là mã
nghiệp vụ đã lưu trong DB (`VT0001`...), đổi tiền tố sẽ lệch với mã đã sinh trước đó, không mang lại
lợi ích gì; nhãn tiếng Việt "Vật tư" (Consumable) và "Chi tiết"/node cấu trúc con vẫn nói "Vật tư"
trong Swagger/UI — chỉ đổi thuật ngữ tiếng Anh trong code; `UnitScope.SEMI_FINISHED`,
`BomType.ROOT`, `ItemType.FG` không liên quan, giữ nguyên.

## Migration DB — `RENAME VALUE` thay vì tạo enum mới

`drizzle-kit generate` tự sinh SQL kiểu drop-và-tạo-lại enum (`ALTER COLUMN ... SET DATA TYPE text`
→ `DROP TYPE` → `CREATE TYPE` mới → `... USING type::text::newtype`) — cách này **phá dữ liệu**: mọi
dòng đang có giá trị cũ (`'RM'`/`'PART'`/`'MATERIAL'`) gãy ngay ở bước cast cuối, vì enum mới không
còn giữ nhãn đó. Migration `0183` được viết tay lại, dùng `ALTER TYPE ... RENAME VALUE` — thao tác
catalog thuần (sửa một dòng `pg_enum` đã commit), không rewrite bảng, không mất dữ liệu, chạy an
toàn trong một transaction. Khác hẳn `ADD VALUE` (thứ mà `docs/decisions/root-bom-item.md` gặp phải
— giá trị mới thêm không dùng được trong cùng transaction đã thêm nó) — `RENAME VALUE` không có hạn
chế đó.

Kèm theo: `ALTER TABLE items RENAME COLUMN material_grade TO consumable_grade` (đổi tên cột, giữ
nguyên 7 dòng có giá trị); dựng lại 2 CHECK (`chk_bom_items_node_shape`,
`chk_production_job_bom_items_item_type`) với nhãn mới; data migration tay 2 dòng
`document_sequences` (`ITEM_RM`→`ITEM_CONSUMABLE`, `ITEM_FG_WIP`→`ITEM_FG`, giữ nguyên
`current_value` để không nhảy số mã tự sinh).

## Phạm vi — cả BE lẫn FE cùng đợt

Giá trị enum đổi trên wire (API response/request), nên BE và FE (`web-qlsx-start`) phải lên cùng
lúc — BE mới + FE cũ (hoặc ngược lại) gãy ngay, không phải gãy từ từ. FE đổi cả tên thư mục
feature/route (`materials/` → `consumables/`, `inventory-materials/` → `inventory-consumables/`,
URL `/manage/materials` → `/manage/consumables`) lẫn giá trị enum/field trên wire
(`materialGrade`/`materialKeyword`/`materialCode`/`materialName` → `consumable*`), giữ nguyên nhãn
tiếng Việt "Vật tư"/"Chi tiết".

`ErrorCode` đổi **giá trị chuỗi** (không đổi số): `E110`/`E111`/`E148`/`E229`/`E270` — FE
`create-bom-item.api.ts` đang switch cứng theo các chuỗi này phải đổi theo.

## Đừng làm ngược lại

- Đừng đổi tiền tố mã tự sinh `VT`/`SP` — xem "Không đổi" ở trên.
- Đừng để `drizzle-kit generate` tự áp migration đổi enum value không kiểm tra lại SQL sinh ra —
  luôn dry-run trong `BEGIN ... ROLLBACK` trước khi chạy thật trên DB dùng chung, vì lỗi thật bị
  spinner của `drizzle-kit migrate` nuốt mất, chỉ hiện `[ELIFECYCLE] Command failed with exit code 1`.
- Đừng sửa lại nghĩa "RM"/"PART" trong các doc lịch sử thuần (`docs/decisions/items-merge.md`,
  `docs/decisions/stored-inventory-balances.md` mục `warehouses.type` — bảng `warehouses` đã xoá,
  `docs/decisions/files-registry.md`) — những chỗ đó cố tình giữ nguyên giá trị tại thời điểm quyết
  định, không phải hình dạng hiện tại.

## Related docs

- `docs/decisions/wip-removal.md`, `docs/decisions/root-bom-item.md` — đặt tên `PART`/`RM` ban đầu,
  cả hai đã cập nhật pointer note dùng tên sau đợt đổi này.
- `docs/decisions/items-merge.md` — quyết định gộp `products`+`materials` (lịch sử; `type` tại thời
  điểm đó có 3 giá trị `FG|WIP|RM`, giữ nguyên trong nội dung mô tả).
- `docs/domains/product-structure.md` — mô hình `items`/BOM đầy đủ hiện tại, dùng tên sau đổi.
