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
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { PaymentRequestItemResDto } from './payment-request-item.res.dto';
import { PaymentRequestPurchaseOrderRefResDto } from './payment-request-purchase-order-ref.res.dto';
import { PaymentRequestSupplierRefResDto } from './payment-request-supplier-ref.res.dto';

@Exclude()
export class PaymentRequestResDto {
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
  @NumberField({
    description:
      'Giá trị yêu cầu thanh toán = tổng tiền PO (tiền hàng + VAT + chi phí khác) chốt lúc sinh',
  })
  requestValue!: number;

  @Expose()
  @NumberField({ description: 'Tiền hàng chưa thuế của PO' })
  subtotal!: number;

  @Expose()
  @NumberField({ description: 'Thuế VAT của PO (%)' })
  vatPercent!: number;

  @Expose()
  @NumberField({ description: 'Tiền VAT của PO' })
  vatAmount!: number;

  @Expose()
  @NumberField({ description: 'Chi phí khác của PO' })
  otherCost!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Diễn giải chi phí khác',
  })
  otherCostNote!: string | null;

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
