import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateBomItemMaterialReqDto {
  @NumberFieldOptional({ isPositive: true, description: 'Định mức sử dụng' })
  readonly quantity?: number;

  @NumberFieldOptional({ int: true, min: 0 })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
