<!-- Generated: 2026-10-16 | Files scanned: 10 codemaps + src/api listing | Token estimate: ~950 -->
# Codemaps index

Entry point for tracing the backend. A codemap is a map; the code is the source of truth. If they disagree, trust the code and fix the codemap.

## How to read
1. Find the domain in the table below and open its codemap.
2. In the codemap, follow Routes (METHOD path, permission, Controller.method, Service.method, tables), then State flows, then Key rules (error codes `E###`).
3. Open the cited `path:line` in `src/`. Error codes live in `src/constants/error-code.constant.ts`, permission codes in `src/constants/permission.constant.ts`.
4. For a chain that starts in the UI (button, server function, endpoint, status) open `../../../web-qlsx-start/docs/CODEMAPS/system-flow.md`; screen-side codemaps are in `../../../web-qlsx-start/docs/CODEMAPS/INDEX.md`.
5. Start with `architecture.md` for request pipeline and conventions, and `data.md` for tables and enums.

## Codemaps
| File | Covers |
|---|---|
| `architecture.md` | main/app module, global guards and pipes, shared folders, file-split convention, how to add an endpoint |
| `data.md` | schema groups, core FK chain, status enums, DB conventions, migrations |
| `sales.md` | orders (SO), clients, client-groups, outbound-orders (DO), countries |
| `purchasing.md` | purchase-requests, purchase-quotations, purchase-orders (DMH), purchase-notes, purchase-ledger, payment-requests, suppliers, supplier-groups |
| `inventory.md` | inventory, inventory-receipts, inventory-issues, inventory-requisitions, inventory-adjustments, inventory-products, inventory-directs, supplier-returns |
| `product-structure.md` | items, item-units, units, boms, bom-directs, bom-operations, operations, routings |
| `production.md` | production-orders (LSX), production-jobs (JOB), production-execution, outsourcing-orders, outsourcing-receipts |
| `quality.md` | iqc, oqc, ncrs (incl. OQC Fail, Sort, NCR, secondary LSX, re-OQC flow) |
| `identity-access.md` | auth, users, roles, departments, positions, permission model |
| `integration.md` | integration, reports, files, health, storage and redis infra |

## Glossary
| Term | Meaning |
|---|---|
| SO | sales order (`orders`) |
| LSX | production order (`production-orders`); a secondary LSX comes from an NCR (`ncrAction` REWORK or REMAKE) |
| JOB | production job (`production-jobs`), one per LSX line |
| DMH | supplier purchase order (`purchase-orders`) |
| DO | outbound delivery order (`outbound-orders`) |
| PXK | goods issue note created when a requisition is approved |
| IQC / OQC | incoming / outgoing quality check |
| NCR | non-conformance report (`ncrs`); NCR-NB internal, NCR-KH customer |
| RFQ | purchase quotation request (`purchase-quotations`) |
| PH-nnn | ticket id used in commit messages and the issue sheet |

## Citation conventions
Each codemap keeps its own line convention; read the file's header lines. `production.md` and the FE codemaps cite the controller handler-method line (`ctrl:N`), `quality.md`, `sales.md` and `integration.md` cite the route decorator line, service citations are the method definition line (or the exact statement line when it points into a body).

## Where each domain lives
auth, users, roles, departments, positions: identity-access. clients, client-groups, countries, orders, outbound-orders: sales. suppliers, supplier-groups, purchase-requests, purchase-quotations, purchase-orders, purchase-notes, purchase-ledger, payment-requests: purchasing. inventory, inventory-adjustments, inventory-directs, inventory-issues, inventory-products, inventory-receipts, inventory-requisitions, supplier-returns: inventory. items, item-units, units, boms, bom-directs, bom-operations, operations, routings: product-structure. production-orders, production-jobs, production-execution, outsourcing-orders, outsourcing-receipts: production. iqc, oqc, ncrs: quality. integration, reports, files, health: integration.

## Maintenance
When a change adds or edits a route, a status transition, a table or a cross-domain call, update the matching codemap and refresh its `Generated:` header (`/ecc:update-codemaps` helps). The same rule is in `.claude/rules/project-overrides.md`.
