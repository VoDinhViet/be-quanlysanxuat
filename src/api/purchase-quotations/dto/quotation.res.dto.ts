import { Exclude, Expose } from 'class-transformer';

import { PurchaseQuotationStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { QuotationItemResDto } from './quotation-item.res.dto';

@Exclude()
export class QuotationResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã báo giá' })
  code!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @EnumField(() => PurchaseQuotationStatus)
  status!: PurchaseQuotationStatus;

  @Expose()
  @DateField({ description: 'Ngày lập báo giá' })
  quotationDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true })
  validUntil!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => QuotationItemResDto, { each: true })
  items!: QuotationItemResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  senderBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  sentAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  receiverBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  receivedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  cancellerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  cancelledAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  cancellationReason!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
