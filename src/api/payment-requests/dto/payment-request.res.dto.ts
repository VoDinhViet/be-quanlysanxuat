import { Exclude, Expose } from 'class-transformer';

import { PaymentRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseOrderAmountsResDto } from '../../purchase-orders/dto/purchase-order-amounts.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { PaymentRequestItemResDto } from './payment-request-item.res.dto';
import { PaymentRequestPurchaseOrderRefResDto } from './payment-request-purchase-order-ref.res.dto';
import { PaymentRequestSupplierRefResDto } from './payment-request-supplier-ref.res.dto';

@Exclude()
export class PaymentRequestResDto extends PurchaseOrderAmountsResDto {
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
    description:
      'Số đề nghị chi = tổng tiền PO (tiền hàng + VAT + chi phí khác) − tạm ứng, chốt lúc sinh/cập nhật tạm ứng',
  })
  requestedAmount!: number;

  @Expose()
  @DateField({ description: 'Hạn thanh toán = orderDate của PO + paymentTerm' })
  dueDate!: Date;

  @Expose()
  @EnumField(() => PaymentRequestStatus)
  status!: PaymentRequestStatus;

  @Expose()
  @ClassField(() => PaymentRequestItemResDto, { each: true })
  items!: PaymentRequestItemResDto[];

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  createdBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  paidBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  paidAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  cancelledBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  cancelledAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  cancellationReason!: string | null;
}
