import { WarehouseStatus, WarehouseType } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetWarehousesReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => WarehouseType)
  readonly type?: WarehouseType;

  @EnumFieldOptional(() => WarehouseStatus)
  readonly status?: WarehouseStatus;
}
