import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { StockStatus } from '../../inventory/inventory.constant';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryProductsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo đúng 1 item' })
  readonly itemId?: string;

  @EnumFieldOptional(() => StockStatus)
  readonly status?: StockStatus;

  @DateFieldOptional({
    description:
      'Xem tồn tại thời điểm 23:59 ngày này; bỏ trống = tồn hiện tại',
  })
  readonly asOfDate?: Date;
}
