import {
  BooleanFieldOptional,
  EmailField,
  PasswordField,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateCredentialReqDto {
  @StringField({ description: 'Login username', maxLength: 100 })
  username!: string;

  @EmailField({ description: 'Login email' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;

  @UUIDFieldOptional({ description: 'Role id to assign to this credential' })
  roleId?: string;

  @BooleanFieldOptional({
    description: 'Enable credential for login',
    nullable: true,
  })
  credentialEnabled?: boolean;
}
