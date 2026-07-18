import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class SupplierRepresentativeResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Representative full name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @BooleanField({ description: 'Whether this is the primary representative' })
  isPrimary!: boolean;
}
