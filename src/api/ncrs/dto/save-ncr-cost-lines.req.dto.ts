import { NcrCostKind } from '../../../database/schemas';
import {
  ClassField,
  EnumField,
  NumberField,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class NcrCostLineReqDto {
  @EnumField(() => NcrCostKind)
  readonly kind!: NcrCostKind;

  @StringField({ maxLength: 500 })
  readonly description!: string;

  @UUIDFieldOptional({ description: 'Vật tư (khi kind = MATERIAL)' })
  readonly itemId?: string;

  @NumberField({ min: 0 })
  readonly quantity!: number;

  @NumberField({ min: 0 })
  readonly unitPrice!: number;
}

export class SaveNcrCostLinesReqDto {
  @ClassField(() => NcrCostLineReqDto, {
    each: true,
    description: 'Thay toàn bộ dòng dự toán của NCR',
  })
  readonly lines!: NcrCostLineReqDto[];
}
