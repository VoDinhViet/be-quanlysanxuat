import { SupplierStatus, SupplierType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EmailFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { SupplierAttachmentReqDto } from './supplier-attachment.req.dto';
import { SupplierPaymentReqDto } from './supplier-payment.req.dto';
import { SupplierRepresentativeReqDto } from './supplier-representative.req.dto';

export class CreateSupplierReqDto {
  // 1. Supplier information
  @StringField({ description: 'Supplier name', maxLength: 255 })
  name!: string;

  @UUIDField({ description: 'Supplier group id (Nhóm NCC)' })
  supplierGroupId!: string;

  @EnumField(() => SupplierType)
  type!: SupplierType;

  @StringField({ description: 'Tax code (Mã số thuế)', maxLength: 50 })
  taxCode!: string;

  @StringField({ description: 'Phone number', maxLength: 30 })
  phoneNumber!: string;

  @StringField({ description: 'Address', maxLength: 500 })
  address!: string;

  @StringFieldOptional({ description: 'Supplier code; auto-generated if omitted', maxLength: 50 })
  code?: string;

  @EmailFieldOptional({ description: 'Email', nullable: true })
  email?: string | null;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @StringFieldOptional({
    description: 'Logo URL (from POST /uploads)',
    nullable: true,
    maxLength: 500,
  })
  logoUrl?: string | null;

  @UUIDFieldOptional({ description: 'Country id', nullable: true })
  countryId?: string | null;

  // 2. Payment information
  @ClassFieldOptional(() => SupplierPaymentReqDto)
  payment?: SupplierPaymentReqDto;

  // 3. Other information
  @NumberFieldOptional({ description: 'Rating (0-5)', nullable: true, min: 0, max: 5, int: true })
  rating?: number | null;

  @EnumFieldOptional(() => SupplierStatus)
  status?: SupplierStatus;

  @StringFieldOptional({
    description: 'Internal note (not visible to the supplier)',
    nullable: true,
    maxLength: 1000,
  })
  internalNote?: string | null;

  @ClassFieldOptional(() => SupplierAttachmentReqDto, { each: true })
  attachments?: SupplierAttachmentReqDto[];

  @ClassFieldOptional(() => SupplierRepresentativeReqDto, { each: true })
  representatives?: SupplierRepresentativeReqDto[];
}
