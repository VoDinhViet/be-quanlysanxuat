/** Một dòng đơn mua Chờ xác nhận sinh từ một NCC thắng thầu — `quantity` lấy từ dòng **vật tư** của báo
 * giá (`purchase_quotation_items`), `unitPrice` lấy từ dòng **NCC** thắng thầu
 * (`purchase_quotation_item_suppliers`). `quantityAdjustmentReason` lấy từ chính phân bổ
 * (`purchase_quotation_item_allocations`) — 1:1 với dòng PO sinh ra, không cần gộp nhiều lý do.
 * Xem `docs/workflows/rfq-approval.md`. */
export type PurchaseOrderPendingLine = {
  purchaseRequestItemId: string;
  quotationItemSupplierId: string;
  quantity: number;
  unitPrice: number | null;
  leadTimeDays: number | null;
  quantityAdjustmentReason: string | null;
};

/** Input của `PurchaseOrdersService.createPendingOrdersFromQuotation` — chỉ dựng được từ
 * `PurchaseQuotationsService.approveQuotation`/`recallQuotation`, nơi duy nhất gom dòng thắng thầu
 * theo NCC. */
export type CreatePendingOrdersFromQuotationInput = {
  quotationId: string;
  createdBy: string;
  linesBySupplierId: Map<string, PurchaseOrderPendingLine[]>;
};

// Aliases for backwards compatibility
export type PurchaseOrderDraftLine = PurchaseOrderPendingLine;
export type CreateDraftOrdersFromQuotationInput =
  CreatePendingOrdersFromQuotationInput;
