import {
  EmailField,
  PasswordField,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** ERP login credential fields, provisioned alongside a user. */
export class CreateCredentialReqDto {
  @StringField({ description: 'Login username', maxLength: 100 })
  username!: string;

  @EmailField({ description: 'Login email' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;

  // Nested here rather than on `CreateUserReqDto` because authorization is anchored on the
  // credential (`credentials.roleId`), not on the employee row — which also makes "sent a roleId
  // but asked for no credential" structurally impossible. Assigning it requires the caller to
  // hold `roles:update` on top of `users:create` (enforced in `UsersService`, E033).
  @UUIDFieldOptional({ description: 'Role id to assign to this credential' })
  roleId?: string;
}
