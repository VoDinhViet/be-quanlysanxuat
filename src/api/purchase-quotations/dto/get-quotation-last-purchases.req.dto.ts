import { Transform } from 'class-transformer';

import { UUIDField } from '../../../decorators/field.decorators';

export class GetQuotationLastPurchasesReqDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @UUIDField({ each: true, description: 'Các vật tư cần tra giá mua gần nhất' })
  readonly itemIds!: string[];
}
