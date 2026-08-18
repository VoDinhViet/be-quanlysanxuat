import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ItemType } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { StockStatus } from '../inventory.constant';

export class GetInventoryReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ItemType, {
    description: 'Bỏ trống = FG/RM (kho không quản tồn WIP)',
  })
  readonly itemType?: ItemType;

  @UUIDFieldOptional({ description: 'Filter theo NCC — chỉ có ý nghĩa với RM' })
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
