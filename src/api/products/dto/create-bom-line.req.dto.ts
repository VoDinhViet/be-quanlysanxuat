import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateBomLineReqDto {
  @UUIDField()
  parentItemId!: string;

  @UUIDField()
  childItemId!: string;

  @NumberField({ min: 0 })
  qty!: number;

  @UUIDField()
  unitId!: string;

  @NumberFieldOptional({ min: 0 })
  scrapRate?: number;

  @NumberFieldOptional({ int: true, min: 0 })
  sortOrder?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
