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

The detailed realistic timeline with AI assistance lives in:

- [products-bom-routing-plan.md#timeline-task-table](../../products-bom-routing-plan.md#timeline-task-table)

Summary:

- `1 dev chính + AI hỗ trợ`: about 10 working days.
- `2 dev + AI hỗ trợ`: about 7-8 working days if backend and frontend run in parallel after the API contract stabilizes.
- Keep one final day for integration QA, polish, and documentation updates.

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
