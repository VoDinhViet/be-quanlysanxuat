import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OrderStatus } from '../../../database/schemas';
import { EnumFieldOptional, UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetOrdersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => OrderStatus)
  status?: OrderStatus;

  @UUIDFieldOptional()
  clientId?: string;
}
