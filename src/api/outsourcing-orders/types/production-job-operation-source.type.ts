import type {
  ProductionJobBomItemSelect,
  ProductionJobOperationSelect,
  ProductionJobSelect,
} from '../../../database/schemas';

/** Shape của `production_job_operations` kèm `productionJob`/`bomItem` như
 * `OutsourcingOrdersService.resolveJobOperationSource` đọc — cast tường minh, cùng lý do
 * `SourceBomItemRow` (`.claude/rules/service.md`). */
export type ProductionJobOperationSource = ProductionJobOperationSelect & {
  productionJob: ProductionJobSelect;
  bomItem: ProductionJobBomItemSelect;
};
