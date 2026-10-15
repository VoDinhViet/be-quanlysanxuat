import { Exclude, Expose } from 'class-transformer';

import { PaymentRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
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
      'Giá trị PO = số đề nghị chi + tiền đã tạm ứng cho NCC (tổng tiền PO lúc chốt)',
  })
  purchaseOrderTotalAmount!: number;

  @Expose()
  @NumberField({
    description: 'Tiền đã tạm ứng cho NCC (đã trừ khỏi requestedAmount)',
  })
  advancePaymentAmount!: number;

  @Expose()
  @NumberField({ description: 'Giá trị yêu cầu thanh toán' })
  requestedAmount!: number;

  @Expose()
  @NumberField({
    description: 'Chi phí phát sinh thêm sau khi đặt hàng (VND)',
  })
  extraCost!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Diễn giải / lý do chi phí phát sinh sau đặt hàng',
  })
  extraCostNote?: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Số hóa đơn của NCC do người dùng nhập',
  })
  supplierInvoiceNo!: string | null;

  @Expose()
  @EnumField(() => PaymentRequestStatus)
  status!: PaymentRequestStatus;

  @Expose()
  @DateField()
  createdAt!: Date;
}
