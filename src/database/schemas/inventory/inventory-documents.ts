import { pgEnum } from 'drizzle-orm/pg-core';

/** Vòng đời chung của `inventory_receipts`/`inventory_issues`. Chỉ `POSTED` mới sinh
 * `inventory_transactions`/đụng `inventory_balances` — xem `docs/domains/inventory.md`. */
export enum InventoryDocumentStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export const inventoryDocumentStatusEnum = pgEnum('inventory_document_status', [
  InventoryDocumentStatus.DRAFT,
  InventoryDocumentStatus.POSTED,
  InventoryDocumentStatus.CANCELLED,
]);
