import { InventoryItemType } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryBalancesReqDto extends PageOptionsDto {
  @UUIDFieldOptional()
  readonly warehouseId?: string;

  @EnumFieldOptional(() => InventoryItemType)
  readonly itemType?: InventoryItemType;
}
