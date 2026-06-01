# Products Implementation Plan

## Scope

The products module creates production source data for:

- Product master data.
- Product revisions.
- Multi-level BOM.
- Routing steps for FG/WIP items.
- Image metadata and public product thumbnails.

Out of scope for this module:

- Creating production jobs from orders.
- Material request or purchase request automation.
- Warehouse stock allocation.

## Implementation Order

1. Add product permissions and RBAC seed entries.
2. Add or verify database fields and unique indexes.
3. Implement product CRUD, lock/unlock, copy, image, and option APIs.
4. Implement revision list/create/update APIs.
5. Implement BOM tree and BOM line mutation APIs.
6. Implement routing get/replace APIs.
7. Add focused backend tests for business rules.
8. Update frontend list, forms, detail, BOM tree, and routing dialogs.
9. Run integration verification.
10. Keep docs current when endpoints, DTOs, permissions, or rules change.

## Timeline

Timeline thực tế giả định bắt đầu từ `2026-06-01`, có AI hỗ trợ viết code/test/docs nhưng vẫn cần dev review, chạy kiểm tra và sửa lỗi tích hợp. Không tính thứ bảy/chủ nhật. Mỗi API là một task riêng. Mỗi button UI kèm xử lý logic là một task riêng để dễ estimate, review và nghiệm thu.

Giả định nguồn lực:

- `1 dev chính + AI hỗ trợ`: khoảng 10 ngày làm việc, từ `2026-06-01` đến `2026-06-12`.
- `2 dev + AI hỗ trợ`: có thể rút còn khoảng 7-8 ngày làm việc nếu backend và frontend chạy song song sau khi API contract ổn định.
- Timeline dưới đây dùng phương án `1 dev chính + AI hỗ trợ`, có buffer kiểm thử và sửa lỗi cuối module.

| Giai đoạn                   | Ngày bắt đầu | Ngày kết thúc |  Giờ | Nội dung                                                                                    | Ghi chú                                   |
| --------------------------- | ------------ | ------------- | ---: | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Backend core API            | 2026-06-01   | 2026-06-03    |   24 | Product CRUD, options, image, revision, copy, lock/unlock, BOM tree/add                     | Ưu tiên chốt contract cho FE.             |
| Backend BOM/Routing + tests | 2026-06-04   | 2026-06-05    |   18 | BOM update/delete, routing get/save, focused tests, docs                                    | Có buffer sửa rule lock/cycle/qty.        |
| Frontend list/form actions  | 2026-06-08   | 2026-06-09    |   15 | List, search/filter, create/edit, lock/unlock, copy, delete                                 | Dùng API đã chốt từ backend.              |
| Frontend detail/BOM/Routing | 2026-06-10   | 2026-06-11    | 19.5 | Detail, revision selector, revision dialogs, BOM tree, add/edit/delete node, routing dialog | Phần có rủi ro UI/logic cao nhất.         |
| Integration QA + polish     | 2026-06-12   | 2026-06-12    |    7 | Typecheck/lint, manual verification, fix edge cases, update docs                            | Không nhận thêm scope mới trong ngày này. |

### Task Breakdown

| ID    | Nhóm          | Task                                                                                         | Ngày bắt đầu | Ngày kết thúc |  Giờ | Ghi chú                                                   |
| ----- | ------------- | -------------------------------------------------------------------------------------------- | ------------ | ------------- | ---: | --------------------------------------------------------- |
| BE-01 | Backend setup | Add product permissions and RBAC seed                                                        | 2026-06-01   | 2026-06-01    |  1.5 | `products:*` permission codes.                            |
| BE-02 | Backend setup | Add/verify product schema fields and indexes                                                 | 2026-06-01   | 2026-06-01    |    2 | `clientId`, unique code, revision unique, BOM sort order. |
| BE-03 | API           | `GET /products` list API                                                                     | 2026-06-01   | 2026-06-01    |    2 | Search/filter/pagination, fixed sort by `createdAt desc`. |
| BE-04 | API           | `POST /products` create API                                                                  | 2026-06-01   | 2026-06-01    |    2 | Create product and initial revision in one transaction.   |
| BE-05 | API           | `GET /products/:productId` detail API                                                        | 2026-06-01   | 2026-06-01    |    1 | Include client, unit, current revision.                   |
| BE-06 | API           | `PATCH /products/:productId` update API                                                      | 2026-06-01   | 2026-06-01    |  1.5 | Reject locked products and duplicate code.                |
| BE-07 | API           | `PATCH /products/:productId/lock` lock API                                                   | 2026-06-02   | 2026-06-02    |    1 | Lock product mutations.                                   |
| BE-08 | API           | `PATCH /products/:productId/unlock` unlock API                                               | 2026-06-02   | 2026-06-02    |    1 | Restore product status to active.                         |
| BE-09 | API           | `POST /products/:productId/copy` copy API                                                    | 2026-06-02   | 2026-06-02    |    3 | Copy product, current revision, BOM and routing.          |
| BE-10 | API           | `DELETE /products/:productId` delete API                                                     | 2026-06-02   | 2026-06-02    |    1 | Soft delete only.                                         |
| BE-11 | API           | `POST /products/:productId/image` upload image API                                           | 2026-06-02   | 2026-06-02    |    2 | Multipart upload, max 5 MB.                               |
| BE-12 | API           | `DELETE /products/:productId/image` delete image API                                         | 2026-06-02   | 2026-06-02    |    1 | Clear `imageUrl`, soft delete file records.               |
| BE-13 | API           | `GET /products/options` product options API                                                  | 2026-06-02   | 2026-06-02    | 0.75 | Used by BOM item search.                                  |
| BE-14 | API           | `GET /products/units/options` unit options API                                               | 2026-06-02   | 2026-06-02    |  0.5 | Used by forms and BOM.                                    |
| BE-15 | API           | `GET /products/types/options` product type options API                                       | 2026-06-02   | 2026-06-02    |  0.5 | Used by filters/forms.                                    |
| BE-16 | API           | `GET /products/operations/options` operation options API                                     | 2026-06-02   | 2026-06-02    |  0.5 | Used by routing dialog.                                   |
| BE-17 | API           | `GET /products/:productId/revisions` list revisions API                                      | 2026-06-03   | 2026-06-03    |    1 | Sort by created date.                                     |
| BE-18 | API           | `POST /products/:productId/revisions` create revision API                                    | 2026-06-03   | 2026-06-03    |    2 | Optional copy from source revision.                       |
| BE-19 | API           | `PATCH /products/:productId/revisions/:revisionId` update revision API                       | 2026-06-03   | 2026-06-03    |    1 | Update revision number and note.                          |
| BE-20 | API           | `GET /products/:productId/revisions/:revisionId/bom-tree` BOM tree API                       | 2026-06-03   | 2026-06-03    |    3 | Return nested tree with routing indicator.                |
| BE-21 | API           | `POST /products/:productId/revisions/:revisionId/bom-lines` add BOM line API                 | 2026-06-03   | 2026-06-03    |  2.5 | Validate parent type, child type, cycle and qty.          |
| BE-22 | API           | `PATCH /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` update BOM line API  | 2026-06-04   | 2026-06-04    |  1.5 | Inline qty/unit/note updates.                             |
| BE-23 | API           | `DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` delete BOM line API | 2026-06-04   | 2026-06-04    |  1.5 | Delete node and descendants.                              |
| BE-24 | API           | `GET /products/:productId/revisions/:revisionId/items/:itemId/routing` get routing API       | 2026-06-04   | 2026-06-04    |    1 | Sort by `stepNo`.                                         |
| BE-25 | API           | `PUT /products/:productId/revisions/:revisionId/items/:itemId/routing` replace routing API   | 2026-06-04   | 2026-06-04    |  2.5 | Validate FG/WIP only, duplicate step, outsource supplier. |
| BE-26 | Tests         | Backend focused tests                                                                        | 2026-06-05   | 2026-06-05    |    4 | Cover API business rules and locked state.                |
| BE-27 | Docs          | Update module spec and system flow                                                           | 2026-06-05   | 2026-06-05    |    1 | Keep API rules current for later agents.                  |
| FE-01 | Page          | Product list page shell                                                                      | 2026-06-08   | 2026-06-08    |    2 | Route `/manage/products`, table and toolbar.              |
| FE-02 | UI action     | `[+ Tạo sản phẩm]` button + create dialog logic                                              | 2026-06-08   | 2026-06-08    |    3 | TanStack form, image field, create action.                |
| FE-03 | UI action     | `[Tìm kiếm]` input + query param logic                                                       | 2026-06-08   | 2026-06-08    |    1 | Use `nuqs` and transition.                                |
| FE-04 | UI action     | `[Lọc]` filter controls + query param logic                                                  | 2026-06-08   | 2026-06-08    |  1.5 | Client, item type, status.                                |
| FE-05 | UI action     | `[Xem]` button + detail navigation                                                           | 2026-06-09   | 2026-06-09    |    1 | Link to product detail page.                              |
| FE-06 | UI action     | `[Sửa]` button + edit dialog logic                                                           | 2026-06-09   | 2026-06-09    |    2 | Update product, image and default revision.               |
| FE-07 | UI action     | `[Lock/Mở khóa]` button + confirm logic                                                      | 2026-06-09   | 2026-06-09    |  1.5 | Lock and unlock based on current status.                  |
| FE-08 | UI action     | `[Copy]` button + copy logic                                                                 | 2026-06-09   | 2026-06-09    |  1.5 | Copy product and refresh/redirect.                        |
| FE-09 | UI action     | `[Xóa]` button + delete dialog logic                                                         | 2026-06-09   | 2026-06-09    |  1.5 | Confirm dialog and soft delete action.                    |
| FE-10 | Detail        | Product detail layout                                                                        | 2026-06-10   | 2026-06-10    |    2 | Full page layout with back button and product summary.    |
| FE-11 | UI action     | Revision selector + URL state logic                                                          | 2026-06-10   | 2026-06-10    |  1.5 | Use `nuqs` and `useTransition`.                           |
| FE-12 | UI action     | `[Tạo revision]` button + create revision dialog logic                                       | 2026-06-10   | 2026-06-10    |    2 | Optional copy from source revision.                       |
| FE-13 | UI action     | `[Sửa revision]` button + update revision dialog logic                                       | 2026-06-10   | 2026-06-10    |  1.5 | Edit revision number/note.                                |
| FE-14 | Component     | BOM tree-grid render                                                                         | 2026-06-10   | 2026-06-10    |    3 | Tree indentation, image/icon, routing indicator.          |
| FE-15 | UI action     | BOM `[+]` button + add node dialog logic                                                     | 2026-06-11   | 2026-06-11    |    3 | Search child product/material, qty/unit validation.       |
| FE-16 | UI action     | BOM `SL` inline edit + save logic                                                            | 2026-06-11   | 2026-06-11    |    2 | WIP integer, RM decimal.                                  |
| FE-17 | UI action     | BOM `[X]` button + delete node dialog logic                                                  | 2026-06-11   | 2026-06-11    |  1.5 | Confirm delete and refresh tree.                          |
| FE-18 | UI action     | `[Routing]` button + routing dialog open logic                                               | 2026-06-11   | 2026-06-11    |  1.5 | Hidden/disabled for RM and consumable.                    |
| FE-19 | UI action     | `[Thêm công đoạn]` button + add row logic                                                    | 2026-06-11   | 2026-06-11    |  1.5 | Auto next `stepNo`.                                       |
| FE-20 | UI action     | Routing `[Lưu]` button + replace routing logic                                               | 2026-06-12   | 2026-06-12    |    2 | Save full routing step list.                              |
| FE-21 | UI action     | Routing `[Xóa dòng]` button + remove row logic                                               | 2026-06-12   | 2026-06-12    |    1 | Local remove before save.                                 |
| FE-22 | UI action     | Product image click + preview dialog logic                                                   | 2026-06-12   | 2026-06-12    |    1 | Large image preview with fallback icon.                   |
| FE-23 | Verification  | Frontend lint/typecheck/manual verification                                                  | 2026-06-12   | 2026-06-12    |    3 | Product list, form, BOM, routing, lock/copy/delete.       |

## Change Checklist

- Update [api.md](api.md) when endpoints, DTOs, permissions, database rules, dependencies, or security rules change.
- Update [test.md](test.md) when adding or changing API behavior that requires verification.
- Update [preview.md](preview.md) when product UI flows, buttons, dialogs, or user-visible states change.
- Update `docs/system-flow.md` when products become part of job/material calculation flow.

## Open Questions

- Should `clientId` be required or optional for products?
- Should product code be unique globally or unique per customer?
- Should locking eventually apply to product revisions instead of the whole product?
- Should RM be managed as a normal product in the same screen?
