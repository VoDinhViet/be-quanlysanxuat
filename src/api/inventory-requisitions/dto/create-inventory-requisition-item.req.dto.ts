import {
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateInventoryRequisitionItemReqDto {
  @UUIDField({ description: 'Id vật tư — bắt buộc type = RM' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'SL lãnh' })
  readonly quantity!: number;

  @StringFieldOptional({ nullable: true, maxLength: 500 })
  readonly note?: string | null;
}
