import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOrdersReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by sales staff (users) id' })
  readonly staffId?: string;

  @EnumFieldOptional(() => OrderStatus)
  readonly status?: OrderStatus;

  @DateFieldOptional({ description: 'Filter: dueDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: dueDate <= toDate' })
  readonly toDate?: Date;
}
