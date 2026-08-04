import { WarehouseStatus, WarehouseType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateWarehouseReqDto {
  @StringFieldOptional({ maxLength: 255, description: 'Tên kho' })
  readonly name?: string;

  @EnumFieldOptional(() => WarehouseType)
  readonly type?: WarehouseType;

  @EnumFieldOptional(() => WarehouseStatus)
  readonly status?: WarehouseStatus;
}
