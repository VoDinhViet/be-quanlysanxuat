import type {
  ItemSelect,
  PurchaseQuotationItemAllocationSelect,
  PurchaseQuotationItemSelect,
  PurchaseQuotationItemSupplierSelect,
} from '../../../database/schemas';

/** Shape of one `purchase_quotation_items` row as `PurchaseQuotationsService.getQuotation`'s
 * relational query returns it — Drizzle's type inference struggles on this depth of nested `with`
 * (same class of issue as `SourceBomItemRow` in `production-jobs`), so the query result is cast to
 * this at the call site. */
export type QuotationDetailItem = PurchaseQuotationItemSelect & {
  item: Pick<ItemSelect, 'id'>;
  allocations: (PurchaseQuotationItemAllocationSelect & {
    purchaseRequestItem: { item: Pick<ItemSelect, 'id'> };
  })[];
  suppliers: PurchaseQuotationItemSupplierSelect[];
};
