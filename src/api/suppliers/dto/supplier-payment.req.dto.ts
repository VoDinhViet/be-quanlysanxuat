import { PaymentMethod, PaymentTerm } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class SupplierPaymentReqDto {
  @StringFieldOptional({
    description: 'Bank name',
    nullable: true,
    maxLength: 255,
  })
  bankName?: string | null;

  @StringFieldOptional({
    description: 'Bank account number',
    nullable: true,
    maxLength: 50,
  })
  bankAccountNumber?: string | null;

  @StringFieldOptional({
    description: 'Bank account holder',
    nullable: true,
    maxLength: 255,
  })
  bankAccountHolder?: string | null;

  @StringFieldOptional({
    description: 'Bank branch',
    nullable: true,
    maxLength: 255,
  })
  bankBranch?: string | null;

  @EnumFieldOptional(() => PaymentMethod, { nullable: true })
  defaultPaymentMethod?: PaymentMethod | null;

  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  defaultPaymentTerm?: PaymentTerm | null;

  @NumberFieldOptional({
    description: 'Credit limit (VND)',
    nullable: true,
    min: 0,
    int: true,
  })
  creditLimit?: number | null;

  @DateFieldOptional({ description: 'Credit limit start date', nullable: true })
  creditLimitStartDate?: Date | null;
}
