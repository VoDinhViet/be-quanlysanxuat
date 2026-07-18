import { Exclude, Expose } from 'class-transformer';

import { StringField, StringFieldOptional, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class CountryResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Country code (ISO 3166-1 alpha-2)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Country name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ description: 'Flag logo URL', nullable: true })
  logoUrl!: string | null;
}
