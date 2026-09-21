import { OrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportOrdersReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by sales staff (users) id' })
  readonly assignedUserId?: string;

  @EnumFieldOptional(() => OrderStatus)
  readonly status?: OrderStatus;

  @DateFieldOptional({ description: 'Filter: dueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: dueDate <= endDate' })
  readonly endDate?: Date;
}
