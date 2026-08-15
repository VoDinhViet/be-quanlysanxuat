import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PaymentRequestItemResDto {
  @Expose()
  @UUIDField({
    description: 'Id dòng đơn mua (purchase_order_items) tương ứng',
  })
  id!: string;

  @Expose()
  @StringField()
  materialCode!: string;

  @Expose()
  @StringField()
  materialName!: string;

  @Expose()
  @StringField()
  unit!: string;

  @Expose()
  @NumberField({ description: 'SL đặt của dòng PO' })
  orderedQty!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhập kho (Σ phiếu nhập POSTED)' })
  receivedQty!: number;

  @Expose()
  @NumberField()
  unitPrice!: number;

  @Expose()
  @NumberField({ description: 'orderedQty * unitPrice' })
  lineTotal!: number;
}
