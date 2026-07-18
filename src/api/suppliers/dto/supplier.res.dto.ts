import { Exclude, Expose } from 'class-transformer';

import { SupplierStatus, SupplierType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { CountryRefResDto } from './country-ref.res.dto';
import { SupplierAttachmentResDto } from './supplier-attachment.res.dto';
import { SupplierCreatorResDto } from './supplier-creator.res.dto';
import { SupplierGroupRefResDto } from './supplier-group-ref.res.dto';
import { SupplierPaymentResDto } from './supplier-payment.res.dto';
import { SupplierRepresentativeResDto } from './supplier-representative.res.dto';

@Exclude()
export class SupplierResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Supplier code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Supplier name' })
  name!: string;

  @Expose()
  @ClassField(() => SupplierGroupRefResDto)
  group!: SupplierGroupRefResDto;

  @Expose()
  @EnumField(() => SupplierType)
  type!: SupplierType;

  @Expose()
  @StringField({ description: 'Tax code' })
  taxCode!: string;

  @Expose()
  @StringField({ description: 'Phone number' })
  phoneNumber!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringField({ description: 'Address' })
  address!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  logoUrl!: string | null;

  @Expose()
  @ClassFieldOptional(() => CountryRefResDto, { nullable: true })
  country!: CountryRefResDto | null;

  @Expose()
  @ClassField(() => SupplierPaymentResDto)
  payment!: SupplierPaymentResDto;

  @Expose()
  @NumberFieldOptional({ nullable: true })
  rating!: number | null;

  @Expose()
  @EnumField(() => SupplierStatus)
  status!: SupplierStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  internalNote!: string | null;

  @Expose()
  @ClassField(() => SupplierAttachmentResDto, { each: true })
  attachments!: SupplierAttachmentResDto[];

  @Expose()
  @ClassField(() => SupplierRepresentativeResDto, { each: true })
  representatives!: SupplierRepresentativeResDto[];

  @Expose()
  @ClassFieldOptional(() => SupplierCreatorResDto, { nullable: true })
  creator!: SupplierCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
