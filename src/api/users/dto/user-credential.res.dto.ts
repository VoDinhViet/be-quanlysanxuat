import { Exclude, Expose } from 'class-transformer';

import { EmailField, StringField, UUIDField } from '../../../decorators/field.decorators';

/** ERP credential summary nested inside UserResDto; never includes the password. */
@Exclude()
export class UserCredentialResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  username!: string;

  @Expose()
  @EmailField()
  email!: string;
}
