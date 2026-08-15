import type {
  ItemSelect,
  PaymentRequestSelect,
  PurchaseOrderItemSelect,
  PurchaseOrderSelect,
  SupplierSelect,
  UnitSelect,
  UserSelect,
} from '../../../database/schemas';

/** Shape của một dòng `purchase_order_items` như query chi tiết yêu cầu thanh toán trả về (nối
 * `purchaseRequestItem.item.unit`, narrow đúng field dùng tới) — Drizzle's relational query type
 * inference collapse ở độ sâu này (cùng lớp vấn đề với `SourceBomItemRow`,
 * `.claude/rules/service.md`), nên cast tường minh ở call site thay vì tin type suy ra. */
export type PaymentRequestOrderItem = PurchaseOrderItemSelect & {
  purchaseRequestItem: {
    item: Pick<ItemSelect, 'code' | 'name'> & {
      unit: Pick<UnitSelect, 'name'>;
    };
  };
};

export type PaymentRequestDetail = PaymentRequestSelect & {
  purchaseOrder: PurchaseOrderSelect & {
    supplier: SupplierSelect;
    items: PaymentRequestOrderItem[];
  };
  paidByUser: UserSelect | null;
  cancelledByUser: UserSelect | null;
  creatorBy: UserSelect | null;
};
