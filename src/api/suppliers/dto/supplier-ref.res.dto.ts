import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to a supplier, nested inside another resource (e.g. `MaterialResDto`). */
@Exclude()
export class SupplierRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;
}
