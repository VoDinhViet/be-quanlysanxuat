import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePurchaseRequestItemReqDto {
  @NumberFieldOptional({ isPositive: true, description: 'SL đề xuất' })
  readonly quantity?: number;

  @StringFieldOptional({ nullable: true, maxLength: 500 })
  readonly note?: string | null;
}
