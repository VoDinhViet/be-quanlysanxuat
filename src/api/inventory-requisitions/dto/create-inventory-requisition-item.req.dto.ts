import {
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateInventoryRequisitionItemReqDto {
  @UUIDField({ description: 'Id vật tư — bắt buộc type = RM' })
  readonly itemId!: string;

  @UUIDFieldOptional({
    description:
      'Đơn vị nhập liệu — mặc định đơn vị gốc của item; phải có trong item_units nếu khác',
  })
  readonly unitId?: string;

  @NumberField({ isPositive: true, description: 'SL lãnh theo unitId' })
  readonly quantity!: number;

  @StringFieldOptional({ nullable: true, maxLength: 500 })
  readonly note?: string | null;
}
