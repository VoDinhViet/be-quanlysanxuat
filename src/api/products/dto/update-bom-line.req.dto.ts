import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateBomLineReqDto {
  @NumberFieldOptional({ min: 0 })
  qty?: number;

  @UUIDFieldOptional()
  unitId?: string;

  @NumberFieldOptional({ min: 0 })
  scrapRate?: number;

  @NumberFieldOptional({ int: true, min: 0 })
  sortOrder?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
