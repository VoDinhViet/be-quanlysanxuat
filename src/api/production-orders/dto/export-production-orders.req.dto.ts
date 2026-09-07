import { ProductionOrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportProductionOrdersReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @EnumFieldOptional(() => ProductionOrderStatus, {
    description: 'PENDING (Chờ duyệt) | APPROVED (Đã duyệt)',
  })
  readonly status?: ProductionOrderStatus;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= endDate' })
  readonly endDate?: Date;
}
