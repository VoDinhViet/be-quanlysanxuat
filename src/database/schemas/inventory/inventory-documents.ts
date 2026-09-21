import { pgEnum } from 'drizzle-orm/pg-core';

/** Vòng đời chung của `inventory_receipts`/`inventory_issues`. Chỉ `POSTED` mới sinh
 * `inventory_transactions`/đụng `inventory_balances` — xem `docs/domains/inventory.md`.
 * `PENDING_IQC`/`IQC_COMPLETED`/`PENDING_RECEIPT` chỉ phiếu nhập phát ra (`confirm`), phiếu
 * xuất/`supplier_returns` không bao giờ mang ba giá trị này dù dùng chung enum. */
export enum InventoryDocumentStatus {
  DRAFT = 'DRAFT',
  PENDING_IQC = 'PENDING_IQC',
  IQC_COMPLETED = 'IQC_COMPLETED',
  PENDING_RECEIPT = 'PENDING_RECEIPT',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export const inventoryDocumentStatusEnum = pgEnum('inventory_document_status', [
  InventoryDocumentStatus.DRAFT,
  InventoryDocumentStatus.PENDING_IQC,
  InventoryDocumentStatus.IQC_COMPLETED,
  InventoryDocumentStatus.PENDING_RECEIPT,
  InventoryDocumentStatus.POSTED,
  InventoryDocumentStatus.CANCELLED,
]);
