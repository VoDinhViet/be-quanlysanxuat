import { BooleanField } from '../../../decorators/field.decorators';

export class UpdatePurchaseRequestItemPurchasableReqDto {
  @BooleanField({ description: 'true: Cần mua, false: Không mua' })
  readonly requiresPurchase!: boolean;
}
