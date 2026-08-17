import type {
  ProductionJobBomItemSelect,
  ProductionJobOperationSelect,
  ProductionJobSelect,
} from '../../../database/schemas';

/** Shape của `production_job_operations` kèm `productionJob` như
 * `OutsourcingOrdersService.ensurePersistedItemsWithinPlanned` đọc — cast tường minh, cùng lý do
 * `SourceBomItemRow` (`.claude/rules/service.md`). */
export type ProductionJobOperationWithJob = ProductionJobOperationSelect & {
  productionJob: ProductionJobSelect;
};

/** Thêm `bomItem` — chỉ `resolveJobOperationSources` nạp quan hệ này, tách khỏi type trên để cast
 * không hứa field mà query không fetch. */
export type ProductionJobOperationSource = ProductionJobOperationWithJob & {
  bomItem: ProductionJobBomItemSelect;
};

export type ResolvedJobOperation = {
  productionJobId: string;
  productionJobBomItemId: string;
  jobQuantity: number;
  operationId: string | null;
  operationCode: string;
  operationName: string;
  itemId: string;
};
