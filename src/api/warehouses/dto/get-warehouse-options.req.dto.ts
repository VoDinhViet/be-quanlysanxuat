import { WarehouseType } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetWarehouseOptionsReqDto {
  @EnumFieldOptional(() => WarehouseType)
  readonly type?: WarehouseType;
}
