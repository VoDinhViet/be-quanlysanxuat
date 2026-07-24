import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  EmailField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { RoleRefResDto } from './credential.res.dto';

/** ERP credential summary nested inside UserResDto; never includes the password. Reuses
 * `RoleRefResDto` (also nested in `CredentialResDto` for `GET /users/me`) for `role`, so both
 * endpoints expose the same `{id, code, name}` shape. */
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

  @Expose()
  @ClassFieldOptional(() => RoleRefResDto, {
    nullable: true,
    description: 'Role assigned to this login identity, or null if none',
  })
  role!: RoleRefResDto | null;
}
