import { ItemType } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetInventoryBalancesReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ItemType, {
    description: 'Bỏ trống = mọi loại (FG/DIRECT)',
  })
  readonly itemType?: ItemType;
}
