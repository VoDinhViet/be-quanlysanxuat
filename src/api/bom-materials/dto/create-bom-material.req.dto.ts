import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateBomMaterialReqDto {
  @UUIDField({ description: 'Id của vật tư' })
  readonly materialId!: string;

  @NumberField({ isPositive: true, description: 'Định mức sử dụng' })
  readonly quantity!: number;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'Sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
