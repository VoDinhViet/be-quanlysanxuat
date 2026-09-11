# Phiếu lãnh vật tư (Inventory Requisition)

Trình tự lập (cảnh báo sớm) → duyệt (giữ hàng + tự sinh PXK Draft) → kho xác nhận xuất kho (trừ
tồn, bên module `inventory-issues`) của `inventory_requisitions`. Business rule/công thức số:
`docs/domains/inventory.md`, mục "Phiếu lãnh vật tư".

## Trigger & actor

Lập/sửa/xoá dòng/gửi duyệt (`create`/`PATCH`/`DELETE`/`send`): PRODUCTION
(`inventory-requisitions:create`/`:update`/`:delete`). Duyệt/từ chối (`approve`/`reject`): DIRECTOR
(`:approve`). Xuất kho thật sự diễn ra ở module khác: WAREHOUSE xác nhận PXK do `approve` tự sinh
qua `POST /inventory-issues/:issueId/post` (`inventory:update`) — WAREHOUSE **không** có
`inventory-requisitions:update`/`:delete`. Huỷ phiếu lãnh (`cancel`,
`inventory-requisitions:update`): chỉ **PRODUCTION**; WAREHOUSE huỷ ngược lại qua
`POST /inventory-issues/:issueId/cancel` (xem bước 4). Method/path đầy đủ: Swagger `/api-docs`.

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
DRAFT ──send──> PENDING_APPROVAL ──approve──> APPROVED ──(kho post PXK)──> ISSUED  (điểm cuối)
  │                   │      │                    │  │
  │                   │      └──reject──> REJECTED │  └──(kho cancel PXK)──> CANCELLED
  │                                          │      │
  └──cancel───────────┴──────────────────────┴──────┴─────────────────────> CANCELLED
```

`approve` tự sinh 1 `inventory_issues` (`DRAFT`, `issueType = PRODUCTION`) và gán
`inventoryIssueId` ngay khi chuyển `APPROVED` — không còn bước "xuất kho" riêng trên module này.
Từ đó phiếu lãnh chỉ còn đổi trạng thái theo hành động của kho trên chính PXK đó:
`POST /inventory-issues/:issueId/post` → `ISSUED`; `POST /inventory-issues/:issueId/cancel` →
`CANCELLED` (xem `InventoryIssuesService`). `cancel` ở module này cũng hợp lệ từ `APPROVED` — huỷ
kéo theo huỷ PXK `DRAFT` đi kèm (không cần đợi kho thao tác).

`cancel` (ở module này hoặc do kho `cancel` PXK) hợp lệ từ mọi trạng thái trừ
`ISSUED`/`CANCELLED` (kể cả từ `REJECTED`, không cần quay lại `DRAFT` trước).

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
   transaction, đây là **mốc giữ chỗ bắt đầu** và cũng là chốt chặn `E227`/`E231`/`E232` thật:
   - `SELECT … FOR UPDATE` header + mọi dòng `inventory_balances` liên quan (`itemIds` sort tăng dần
     để hai phiếu chồng nhau không deadlock). 0 dòng → `E227`.
   - `Có thể lãnh = Tồn thực tế − Đã giữ` (Đã giữ = Σ SL lãnh mọi phiếu khác đang `APPROVED` cùng
     `itemId`) — dòng nào SL lãnh vượt → `E231`.
   - `type = PRODUCTION`: `SL lãnh ≤ requiredQty − Đã lãnh` (Đã lãnh = Σ SL lãnh mọi phiếu `ISSUED`
     cùng `(productionJobId, itemId)`) — vượt → `E232`.
   - Sinh mã `PXK-{năm}-{5}` → insert `inventory_issues` (`DRAFT`, `issueType = PRODUCTION` dù
     `type` gốc là `PRODUCTION` hay `OTHER` — xem lý do ở `docs/domains/inventory.md`) +
     `inventory_issue_items` copy từ dòng phiếu lãnh. **Không đụng tồn kho ở bước này.**
   - `UPDATE status = APPROVED, inventoryIssueId = <PXK vừa sinh>`. "Đã giữ" là số tính lúc đọc,
     không có cột nào ghi ở bước này (`docs/domains/inventory.md`, "`reservedQuantity` vẫn chết");
     duyệt xong phiếu này lập tức tính vào "Đã giữ" cho mọi lượt đọc/duyệt sau.
4. **Kho xác nhận xuất kho** — ngoài module này, trên PXK vừa sinh:
   - `POST /inventory-issues/:issueId/post` (`InventoryIssuesService.postInventoryIssue`) — gate IQC
     (`hasPendingIqcForItems`) → `E203`; `InventoryPostingService.postDocument` trừ
     `inventory_balances`, ghi `inventory_transactions` (`PRODUCTION_OUT`, âm); PXK `→ POSTED`;
     ghi ngược phiếu lãnh `→ ISSUED` (`issuedBy`/`issuedAt`). "Đã giữ" tự giảm ngay sau bước này —
     phép SUM ở bước 3 chỉ tính phiếu còn `APPROVED`, không còn tính phiếu đã `ISSUED`.
   - `POST /inventory-issues/:issueId/cancel` — chỉ nhận khi PXK còn `DRAFT` (`POSTED` bất biến,
     không còn đường huỷ, xem `docs/workflows/stock-movement.md`): PXK `→ CANCELLED`; ghi ngược
     phiếu lãnh `→ CANCELLED` (không hoàn lại `APPROVED` — không có vòng quay lại, sản xuất lập
     phiếu lãnh mới nếu còn cần).
5. **Từ chối** (`rejectInventoryRequisition`, `PENDING_APPROVAL → REJECTED`) — một `UPDATE` + lý do.
   Sửa/xoá dòng sau đó tự đưa `REJECTED → DRAFT` (cùng khuôn `purchase-requests`).
6. **Huỷ** (`cancelInventoryRequisition`) — `DRAFT`/`PENDING_APPROVAL`/`APPROVED → CANCELLED`, một
   transaction. Từ `APPROVED`: huỷ kèm PXK `DRAFT` đi kèm (`inventoryIssueId`) trong cùng
   transaction — PXK ở bước này luôn còn `DRAFT` (nếu kho đã `post` thì phiếu lãnh đã `ISSUED`,
   không còn ở nhánh `cancel` này nữa). **Không có `cancel` từ `ISSUED`** — tồn đã trừ thật, PXK đã
   `POSTED` và bất biến (không còn đường `cancel` nào bên `inventory-issues` nữa); sai thì lập
   phiếu nhập trả (ngoài phạm vi module này).

## Ranh giới transaction

`create`/`approve`/`cancel` mỗi hành động là **một** transaction — không hành động nào gọi hành
động khác trong cùng transaction. `approve` là hành động duy nhất ở module này chạm ≥ 2 bảng của
`inventory-issues` (ghi `inventory_issues`/`inventory_issue_items`) nhưng **không** gọi
`InventoryPostingService` — việc đó dời sang lúc kho `post`
(`InventoryIssuesService.postInventoryIssue`, ranh giới transaction riêng của module đó). `cancel`
từ `APPROVED` ghi thêm 1 `UPDATE` vào `inventory_issues` cùng transaction.

## Nhánh lỗi

| Code   | Khi nào                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `E223` | Phiếu không tồn tại                                                                                   |
| `E224` | Sửa/xoá/`send` khi không còn `DRAFT`/`REJECTED`                                                       |
| `E225` | `approve`/`reject` khi không còn `PENDING_APPROVAL`                                                   |
| `E227` | `approve` khi phiếu 0 dòng                                                                            |
| `E228` | Trùng `itemId` trong cùng payload                                                                     |
| `E229` | Có dòng không phải RM                                                                                 |
| `E230` | `type = PRODUCTION`: có dòng ngoài định mức BOM của Job                                               |
| `E231` | SL lãnh > Có thể lãnh (Tồn − Đã giữ)                                                                  |
| `E232` | `type = PRODUCTION`: SL lãnh > SL BOM còn lại (requiredQty − Đã lãnh)                                 |
| `E233` | `type = PRODUCTION` thiếu `productionJobId`                                                           |
| `E203` | Kho `post` PXK: còn IQC `INCOMING` chưa `COMPLETED` cùng item                                         |
| `E234` | `POST`/`PATCH /inventory-issues` với `issueType = PRODUCTION` — đường cũ bị chặn, phải qua module này |
| `E235` | `DELETE /inventory-issues/:id` trên một PXK do phiếu lãnh sinh ra — huỷ qua `cancel`, không xoá       |

## Related docs

- `docs/domains/inventory.md` — công thức Đã giữ/Có thể lãnh/Khả dụng, entity, lifecycle đầy đủ.
- `docs/domains/production.md` — "Theo dõi đã lãnh" trên `GET /production-jobs/:jobId/bom`.
- `docs/workflows/stock-movement.md` — vòng đời `inventory_issues` mà bước 4 tái sử dụng.
