import { Exclude, Expose } from 'class-transformer';

import { PaymentMethod, PaymentTerm } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class SupplierPaymentResDto {
  @Expose()
  @StringFieldOptional({ nullable: true })
  bankName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  bankAccountNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  bankAccountHolder!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  bankBranch!: string | null;

  @Expose()
  @EnumFieldOptional(() => PaymentMethod, { nullable: true })
  defaultPaymentMethod!: PaymentMethod | null;

  @Expose()
  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  defaultPaymentTerm!: PaymentTerm | null;

  @Expose()
  @NumberFieldOptional({ nullable: true })
  creditLimit!: number | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  creditLimitStartDate!: Date | null;
}
