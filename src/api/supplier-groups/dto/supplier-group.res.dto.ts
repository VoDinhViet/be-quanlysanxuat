import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class SupplierGroupResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Supplier group code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Supplier group name' })
  name!: string;
}
