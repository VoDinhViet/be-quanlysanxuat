import {
  BooleanFieldOptional,
  EmailField,
  PasswordFieldOptional,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

// Wire contract for the `credential` field of PATCH /users/:userId. `username`/`email` are
// required whenever `credential` is sent at all (mirrors `CreateCredentialReqDto`) — the
// service branches on whether the user already has one: no existing credential + no
// `password` here throws E207 (creating one needs a password; updating one doesn't).
export class UpdateCredentialReqDto {
  @StringField({
    description: 'Login username',
    maxLength: 100,
    toLowerCase: true,
  })
  username!: string;

  @EmailField({ description: 'Login email' })
  email!: string;

  @PasswordFieldOptional({
    description: 'New password — omit to keep the current one',
  })
  password?: string;

  @UUIDFieldOptional({ description: 'Role id to assign to this credential' })
  roleId?: string;

  @BooleanFieldOptional({
    description: 'Enable credential for login',
    nullable: true,
  })
  credentialEnabled?: boolean;
}
