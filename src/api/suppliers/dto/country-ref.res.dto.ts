import { Exclude, Expose } from 'class-transformer';

import { StringField, StringFieldOptional, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to a country, nested inside SupplierResDto. */
@Exclude()
export class CountryRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  logoUrl!: string | null;
}
