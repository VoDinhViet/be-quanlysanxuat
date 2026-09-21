import { SupplierStatus, SupplierType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  PhoneFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { SupplierPaymentReqDto } from './supplier-payment.req.dto';
import { SupplierRepresentativeReqDto } from './supplier-representative.req.dto';

export class UpdateSupplierReqDto {
  @StringFieldOptional({ description: 'Supplier name', maxLength: 255 })
  name?: string;

  @UUIDFieldOptional({ description: 'Supplier group id (Nhóm NCC)' })
  supplierGroupId?: string;

  @EnumFieldOptional(() => SupplierType)
  type?: SupplierType;

  @StringFieldOptional({ description: 'Tax code (Mã số thuế)', maxLength: 50 })
  taxCode?: string;

  @PhoneFieldOptional({ description: 'Phone number', maxLength: 30 })
  phoneNumber?: string;

  @StringFieldOptional({ description: 'Address', maxLength: 500 })
  address?: string;

  @StringFieldOptional({ description: 'Supplier code', maxLength: 50 })
  code?: string;

  @EmailFieldOptional({ description: 'Email', nullable: true })
  email?: string | null;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Logo file id (from POST /files?type=SUPPLIER_LOGO)',
  })
  logoFileId?: string | null;

  @UUIDFieldOptional({ description: 'Country id', nullable: true })
  countryId?: string | null;

  @ClassFieldOptional(() => SupplierPaymentReqDto)
  payment?: SupplierPaymentReqDto;

  @NumberFieldOptional({
    description: 'Rating (0-5)',
    nullable: true,
    min: 0,
    max: 5,
    int: true,
  })
  rating?: number | null;

  @EnumFieldOptional(() => SupplierStatus)
  status?: SupplierStatus;

  @StringFieldOptional({
    description: 'Internal note (not visible to the supplier)',
    nullable: true,
    maxLength: 1000,
  })
  internalNote?: string | null;

  @UUIDFieldOptional({
    each: true,
    description: 'File ids (from POST /files?type=SUPPLIER_DOCUMENT)',
  })
  fileIds?: string[];

  @ClassFieldOptional(() => SupplierRepresentativeReqDto, { each: true })
  representatives?: SupplierRepresentativeReqDto[];
}
