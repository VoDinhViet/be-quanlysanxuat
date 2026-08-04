import { WarehouseStatus, WarehouseType } from '../../../database/schemas';
import {
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateWarehouseReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description: 'Mã kho; tự sinh (KHOxxxx) nếu không truyền',
  })
  readonly code?: string;

  @StringField({ maxLength: 255, description: 'Tên kho' })
  readonly name!: string;

  @EnumField(() => WarehouseType)
  readonly type!: WarehouseType;

  @EnumFieldOptional(() => WarehouseStatus)
  readonly status?: WarehouseStatus;
}
