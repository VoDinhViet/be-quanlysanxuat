import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class InventoryReceiptStatusStatResDto {
  @Expose()
  @StringField({
    description: 'Loại phiếu nhập: PURCHASE, PRODUCTION, RETURN, OTHER',
  })
  receiptType!: string;

  @Expose()
  @StringField({ description: 'Trạng thái phiếu nhập, ví dụ DRAFT, POSTED' })
  status!: string;

  @Expose()
  @NumberField({ description: 'Số phiếu nhập', int: true })
  receiptCount!: number;
}
