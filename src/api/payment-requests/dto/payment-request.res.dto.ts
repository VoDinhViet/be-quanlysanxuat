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
  @NumberField({ description: 'Giá trị yêu cầu thanh toán' })
  requestValue!: number;

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
}
