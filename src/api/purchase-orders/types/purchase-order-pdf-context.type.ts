export interface PurchaseOrderPdfItemContext {
  stt: number;
  itemCode: string;
  purchaseRequestCode: string;
  itemName: string;
  unitName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  neededDate: string;
  note: string;
}

export interface PurchaseOrderPdfContext {
  code: string;
  orderDate: string;
  supplierName: string;
  supplierAddress: string;
  subtotal: string;
  vatPercent: number;
  vatAmount: string;
  grandTotal: string;
  amountInWords: string;
  assignedUserName: string;
  ordererName: string;
  items: PurchaseOrderPdfItemContext[];
}
