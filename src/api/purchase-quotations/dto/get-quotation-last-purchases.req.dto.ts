import { UUIDField } from '../../../decorators/field.decorators';
import { ToArrayFromCsv } from '../../../decorators/transform.decorators';

export class GetQuotationLastPurchasesReqDto {
  @ToArrayFromCsv()
  @UUIDField({ each: true, description: 'Các vật tư cần tra giá mua gần nhất' })
  readonly itemIds!: string[];
}
