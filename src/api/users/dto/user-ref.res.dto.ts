import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class UserRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Employee code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Full name' })
  fullName!: string;
}
