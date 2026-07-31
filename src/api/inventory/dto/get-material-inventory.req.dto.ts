import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { MaterialType } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { MaterialStockStatus } from '../inventory.constant';

export class GetMaterialInventoryReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by material group id' })
  readonly materialGroupId?: string;

  @EnumFieldOptional(() => MaterialType)
  readonly type?: MaterialType;

  @UUIDFieldOptional({ description: 'Filter by supplier id' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => MaterialStockStatus)
  readonly status?: MaterialStockStatus;

  @DateFieldOptional({
    description:
      'Xem tồn tại thời điểm 23:59 ngày này; bỏ trống = tồn hiện tại',
  })
  readonly asOfDate?: Date;
}
