import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOrdersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => OrderStatus)
  readonly status?: OrderStatus;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by staff id' })
  readonly staffId?: string;

  @DateFieldOptional({ description: 'Filter: orderDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: orderDate <= toDate' })
  readonly toDate?: Date;
}
