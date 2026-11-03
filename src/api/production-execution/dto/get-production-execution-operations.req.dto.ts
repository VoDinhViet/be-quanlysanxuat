import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ProductionExecutionOperationSort } from '../production-execution.constant';

export class GetProductionExecutionOperationsReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional({ description: 'Lọc theo khách hàng' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= endDate' })
  readonly endDate?: Date;

  @EnumFieldOptional(() => ProductionExecutionOperationSort, {
    description: 'Sắp xếp công đoạn',
  })
  readonly sort?: ProductionExecutionOperationSort;
}
