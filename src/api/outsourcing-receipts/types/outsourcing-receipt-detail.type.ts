import type {
  ItemSelect,
  OutsourcingOrderItemSelect,
  OutsourcingOrderSelect,
  OutsourcingReceiptItemSelect,
  OutsourcingReceiptSelect,
  SupplierSelect,
  UnitSelect,
  UserSelect,
  WarehouseSelect,
} from '../../../database/schemas';

/** Cast tường minh cho các query lồng sâu của `OutsourcingReceiptsService` — cùng lý do
 * `SourceBomItemRow` (`.claude/rules/service.md`). */
export type OutsourcingReceiptItemDetail = OutsourcingReceiptItemSelect & {
  item: ItemSelect & { unit: UnitSelect };
  outsourcingOrderItem: OutsourcingOrderItemSelect & {
    outsourcingOrder: OutsourcingOrderSelect;
  };
};

export type OutsourcingReceiptDetail = OutsourcingReceiptSelect & {
  supplier: SupplierSelect;
  warehouse: WarehouseSelect;
  creatorBy: UserSelect | null;
  posterBy?: UserSelect | null;
  items: OutsourcingReceiptItemDetail[];
};

/** Dòng OS-OUT kèm header — dùng trong validate `E171`/`E187` khi resolve payload OS-IN. */
export type OutsourcingOrderItemWithOrder = OutsourcingOrderItemSelect & {
  outsourcingOrder: OutsourcingOrderSelect;
};
