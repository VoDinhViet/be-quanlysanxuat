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
      'Số đề nghị chi = tổng tiền PO (tiền hàng + VAT + chi phí khác) − tạm ứng + phát sinh',
  })
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

  /** Số hóa đơn của NCC do người dùng nhập. */
  @Expose()
  @StringFieldOptional({ nullable: true })
  supplierInvoiceNo!: string | null;

  /** Ghi chú chung của đơn mua, đọc trực tiếp từ PO nên đổi theo khi PO sửa ghi chú. */
  @Expose()
  @StringFieldOptional({ nullable: true })
  purchaseOrderNote!: string | null;

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
