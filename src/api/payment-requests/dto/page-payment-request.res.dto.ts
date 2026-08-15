import { Exclude, Expose } from 'class-transformer';

import { PaymentRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PaymentRequestPurchaseOrderRefResDto } from './payment-request-purchase-order-ref.res.dto';
import { PaymentRequestSupplierRefResDto } from './payment-request-supplier-ref.res.dto';

@Exclude()
export class PagePaymentRequestResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã yêu cầu thanh toán' })
  code!: string;

  @Expose()
  @ClassField(() => PaymentRequestPurchaseOrderRefResDto)
  purchaseOrder!: PaymentRequestPurchaseOrderRefResDto;

  @Expose()
  @ClassField(() => PaymentRequestSupplierRefResDto)
  supplier!: PaymentRequestSupplierRefResDto;

  @Expose()
  @NumberField({
    description:
      'Giá trị PO — bằng requestValue ở v1 (chưa hỗ trợ thanh toán từng phần)',
  })
  poValue!: number;

  @Expose()
  @NumberField({ description: 'Giá trị yêu cầu thanh toán' })
  requestValue!: number;

  @Expose()
  @EnumField(() => PaymentRequestStatus)
  status!: PaymentRequestStatus;

  @Expose()
  @DateField()
  createdAt!: Date;
}
