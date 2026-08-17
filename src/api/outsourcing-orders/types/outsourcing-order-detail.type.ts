import type {
  ItemSelect,
  OutsourcingOrderItemSelect,
  OutsourcingOrderSelect,
  ProductionJobSelect,
  SupplierSelect,
  UnitSelect,
  UserSelect,
  WarehouseSelect,
} from '../../../database/schemas';

/** Shape của `outsourcing_order_items` kèm `item`/`unit`/`productionJob` như
 * `OutsourcingOrdersService` đọc qua relational query — cast tường minh, cùng lý do
 * `SourceBomItemRow` (`.claude/rules/service.md`): nesting `items -> item -> unit` +
 * `items -> productionJob` vượt độ sâu suy kiểu an toàn của Drizzle. */
export type OutsourcingOrderItemDetail = OutsourcingOrderItemSelect & {
  item: ItemSelect & { unit: UnitSelect };
  productionJob: ProductionJobSelect | null;
};

export type OutsourcingOrderDetail = OutsourcingOrderSelect & {
  supplier: SupplierSelect;
  warehouse: WarehouseSelect;
  creatorBy: UserSelect | null;
  posterBy?: UserSelect | null;
  items: OutsourcingOrderItemDetail[];
};
