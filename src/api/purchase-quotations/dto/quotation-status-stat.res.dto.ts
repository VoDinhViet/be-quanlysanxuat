import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class QuotationStatusStatResDto {
  @Expose()
  @StringField({ description: 'Trạng thái báo giá (RFQ)' })
  status!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số báo giá ở trạng thái này' })
  quotationCount!: number;
}
