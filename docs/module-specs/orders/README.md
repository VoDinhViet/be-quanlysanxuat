# Orders Module Docs

## Purpose

The orders module owns commercial customer orders from sales entry through director approval and production-safe reading.

This module provides source data for:

- Creating approved-order production jobs in later planning modules.
- Snapshotting product price and product identity at order creation time.
- Hiding financial data and PO PDF files from production roles.

Source:

```text
src/api/orders/
```

## Files

- [api.md](api.md): API contract, permissions, dependencies, database rules, and security rules.
- [test.md](test.md): backend test strategy, coverage list, and verification commands.
- [preview.md](preview.md): frontend screens and manual preview checklist.

## Current Status

Implemented:

- Nest module/controller/service/spec scaffold.
- Commercial order list/create/detail/update/delete endpoints.
- Director/Admin approve and reject endpoints.
- PO PDF upload/delete endpoints.
- Production-safe list/detail endpoints.
- Commercial finished-good product option endpoint.
- Product technical file list/upload/delete endpoints in the products module.
- Product `defaultSalePrice` schema field for order unit price snapshot.
- Order code unique index.
- `orders:read-production` permission and Production Manager RBAC seed entry.

Temporarily out of scope:

- Excel order import.
