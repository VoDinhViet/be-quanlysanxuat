# Phiếu lãnh vật tư (Inventory Requisition)

Trình tự lập (cảnh báo sớm) → duyệt (giữ hàng) → xuất (trừ tồn) của `inventory_requisitions`.
Business rule/công thức số: `docs/domains/inventory.md`, mục "Phiếu lãnh vật tư".

## Trigger & actor

Lập/sửa/xoá dòng/gửi duyệt (`create`/`PATCH`/`DELETE`/`send`): PRODUCTION
(`inventory-requisitions:create`/`:update`/`:delete`). Duyệt/từ chối (`approve`/`reject`): DIRECTOR
(`:approve`). Xuất kho (`issue`): WAREHOUSE (`:issue` — quyền riêng, WAREHOUSE **không** có
`:update`/`:delete`). Huỷ (`cancel`, `inventory-requisitions:update`): chỉ **PRODUCTION** — WAREHOUSE
không có quyền này dù thao tác vật lý ở kho. Method/path đầy đủ: Swagger `/api-docs`.

## Precondition

- Mọi `itemId` phải tồn tại (`E007`), là `type = RM`, chưa xoá mềm (`E229`).
- `type = PRODUCTION` bắt buộc `productionJobId` (`E233`) — dòng lấy từ popup chọn vật tư dùng
  chung (`GET /inventory-requisitions/lines`, kèm `productionJobId` để khoanh vùng theo định mức
  BOM của Job). `type = OTHER` không bắt buộc, dùng cột `reason` thay cho liên kết Job (cùng popup,
  gọi không kèm `productionJobId`).
- `type = PRODUCTION`: mọi `itemId` phải có mặt trong `production_job_issues` của đúng Job đó
  (`E230`) — không lãnh được vật tư ngoài định mức BOM.

## Các bước

```
DRAFT ──send──> PENDING_APPROVAL ──approve──> APPROVED ──issue──> ISSUED  (điểm cuối)
  │                   │      │                    │
  │                   │      └──reject──> REJECTED ──send──> PENDING_APPROVAL
  │                                          │
  └──cancel───────────┴──────────────────────┴─────────────> CANCELLED
```

`cancel` hợp lệ từ mọi trạng thái trừ `ISSUED`/`CANCELLED` (kể cả từ `REJECTED`, không cần quay lại
`DRAFT` trước).

1. **Lập phiếu** (`createInventoryRequisition`) — validate đọc (item hợp lệ, `type`/`productionJobId`
   khớp nhau, mỗi dòng ≤ Có thể lãnh và ≤ SL BOM còn lại — cùng bộ check `approve` chạy, xem dưới)
   chạy **trước** khi mở transaction; đây chỉ là **cảnh báo sớm** — `Có thể lãnh` mới tính theo các
   phiếu khác đang `APPROVED`, chưa tính các phiếu `DRAFT`/`PENDING_APPROVAL` khác, nên hai phiếu
   nháp cùng vượt tồn một vật tư đều có thể lọt qua bước này, `approve` mới là chốt thật. Trong
   transaction: sinh mã `MR-{năm}-{5}` (tiếng Anh, khác quy ước Việt hoá `PNK`/`PXK`/`PTNCC` — cố ý,
   `DocumentType.INVENTORY_REQUISITION`) → insert header (`DRAFT`) + dòng.
2. **Gửi duyệt** (`sendInventoryRequisition`, `DRAFT`/`REJECTED → PENDING_APPROVAL`) — một `UPDATE`,
   không transaction.
3. **Duyệt** (`approveInventoryRequisition`, `PENDING_APPROVAL → APPROVED`) — toàn bộ trong 1
   transaction, đây là **mốc giữ chỗ bắt đầu** và cũng là chốt chặn `E231`/`E232` thật:
   - `SELECT … FOR UPDATE` header + mọi dòng `inventory_balances` liên quan (`itemIds` sort tăng dần
     để hai phiếu chồng nhau không deadlock).
   - `Có thể lãnh = Tồn thực tế − Đã giữ` (Đã giữ = Σ SL lãnh mọi phiếu khác đang `APPROVED` cùng
     `(warehouseId, itemId)`) — dòng nào SL lãnh vượt → `E231`.
   - `type = PRODUCTION`: `SL lãnh ≤ requiredQty − Đã lãnh` (Đã lãnh = Σ SL lãnh mọi phiếu `ISSUED`
     cùng `(productionJobId, itemId)`) — vượt → `E232`.
   - `UPDATE status = APPROVED`. **Không đụng tồn kho** — "Đã giữ" là số tính lúc đọc, không có cột
     nào ghi ở bước này (`docs/domains/inventory.md`, "`reservedQuantity` vẫn chết"); duyệt xong
     phiếu này lập tức tính vào "Đã giữ" cho mọi lượt đọc/duyệt sau.
4. **Xuất kho** (`issueInventoryRequisition`, `APPROVED → ISSUED`) — toàn bộ trong 1 transaction:
   - `SELECT … FOR UPDATE` header → `E226` nếu không còn `APPROVED`; `E227` nếu 0 dòng.
   - Gate IQC (`hasPendingIqcForItems`, `src/api/iqc/iqc.query.ts`) — còn IQC `INCOMING` chưa
     `COMPLETED` của cùng `(itemId, warehouseId)` → `E203`, cùng gate `inventory-issues` đang chạy.
   - Sinh mã `PXK-{năm}-{5}` → insert `inventory_issues` (`POSTED` ngay, `issueType = PRODUCTION` dù
     `type` gốc là `PRODUCTION` hay `OTHER` — xem lý do ở `docs/domains/inventory.md`) +
     `inventory_issue_items` copy từ dòng phiếu lãnh.
   - `InventoryPostingService.postDocument` — trừ `inventory_balances`, ghi `inventory_transactions`
     (`PRODUCTION_OUT`, âm).
   - `UPDATE status = ISSUED, inventoryIssueId = <phiếu vừa sinh>`.
   - "Đã giữ" tự giảm ngay sau bước này — phép SUM ở bước 3 chỉ tính phiếu còn `APPROVED`, không còn
     tính phiếu đã `ISSUED`.
5. **Từ chối** (`rejectInventoryRequisition`, `PENDING_APPROVAL → REJECTED`) — một `UPDATE` + lý do.
   Sửa/xoá dòng sau đó tự đưa `REJECTED → DRAFT` (cùng khuôn `purchase-requests`).
6. **Huỷ** (`cancelInventoryRequisition`) — `DRAFT`/`PENDING_APPROVAL`/`APPROVED → CANCELLED`, một
   `UPDATE`. **Không có `cancel` từ `ISSUED`** — tồn đã trừ thật, phiếu xuất đã `POSTED`; sai thì lập
   phiếu nhập trả (ngoài phạm vi module này).

## Ranh giới transaction

Mỗi hành động (`create`/`approve`/`issue`) là **một** transaction — không hành động nào gọi hành
động khác trong cùng transaction. `approve` không đụng bảng kho nào. `issue` là hành động duy nhất
chạm ≥ 2 module (ghi `inventory_issues`/`inventory_issue_items`, gọi
`InventoryPostingService.postDocument`) — cùng khuôn ranh giới transaction của
`InventoryIssuesService.postInventoryIssue`.

## Nhánh lỗi

| Code   | Khi nào                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `E223` | Phiếu không tồn tại                                                                                   |
| `E224` | Sửa/xoá/`send` khi không còn `DRAFT`/`REJECTED`                                                       |
| `E225` | `approve`/`reject` khi không còn `PENDING_APPROVAL`                                                   |
| `E226` | `issue` khi không còn `APPROVED`                                                                      |
| `E227` | `issue` khi phiếu 0 dòng                                                                              |
| `E228` | Trùng `itemId` trong cùng payload                                                                     |
| `E229` | Có dòng không phải RM                                                                                 |
| `E230` | `type = PRODUCTION`: có dòng ngoài định mức BOM của Job                                               |
| `E231` | SL lãnh > Có thể lãnh (Tồn − Đã giữ)                                                                  |
| `E232` | `type = PRODUCTION`: SL lãnh > SL BOM còn lại (requiredQty − Đã lãnh)                                 |
| `E233` | `type = PRODUCTION` thiếu `productionJobId`                                                           |
| `E203` | `issue`: còn IQC `INCOMING` chưa `COMPLETED` cùng `(item, kho)`                                       |
| `E234` | `POST`/`PATCH /inventory-issues` với `issueType = PRODUCTION` — đường cũ bị chặn, phải qua module này |
| `E235` | `cancel` một `inventory_issues` do phiếu lãnh sinh ra                                                 |

## Related docs

- `docs/domains/inventory.md` — công thức Đã giữ/Có thể lãnh/Khả dụng, entity, lifecycle đầy đủ.
- `docs/domains/production.md` — "Theo dõi đã lãnh" trên `GET /production-jobs/:jobId/bom`.
- `docs/workflows/stock-movement.md` — vòng đời `inventory_issues` mà bước 4 tái sử dụng.
