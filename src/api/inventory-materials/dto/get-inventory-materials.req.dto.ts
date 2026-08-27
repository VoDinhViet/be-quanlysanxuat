import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { StockStatus } from '../../inventory/inventory.constant';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryMaterialsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => StockStatus)
  readonly status?: StockStatus;

  @DateFieldOptional({
    description:
      'Xem tồn tại thời điểm 23:59 ngày này; bỏ trống = tồn hiện tại',
  })
  readonly asOfDate?: Date;

  @UUIDFieldOptional({
    description: 'Chỉ tính tồn ở kho này — bỏ trống thì gộp mọi kho',
  })
  readonly warehouseId?: string;
}
