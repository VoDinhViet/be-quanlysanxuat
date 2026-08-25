import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OutsourcingOrderStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetOutsourcingOrdersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => OutsourcingOrderStatus)
  readonly status?: OutsourcingOrderStatus;
}
