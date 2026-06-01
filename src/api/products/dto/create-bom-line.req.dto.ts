import { NumberField, StringFieldOptional, UUIDField } from '../../../decorators/field.decorators';

export class CreateBomLineReqDto {
  @UUIDField()
  parentItemId!: string;

  @UUIDField()
  childItemId!: string;

  @NumberField({ min: 0 })
  qty!: number;

  @UUIDField()
  unitId!: string;

  @NumberField({ min: 0, required: false })
  scrapRate?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
