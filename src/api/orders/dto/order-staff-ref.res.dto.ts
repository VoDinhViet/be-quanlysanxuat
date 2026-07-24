import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to the staff (nhân viên kinh doanh, a `users` row), nested inside
 * OrderResDto. */
@Exclude()
export class OrderStaffRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  fullName!: string;
}
