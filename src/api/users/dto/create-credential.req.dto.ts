import { EmailField, PasswordField, StringField } from '../../../decorators/field.decorators';

/** ERP login credential fields, provisioned alongside a user. */
export class CreateCredentialReqDto {
  @StringField({ description: 'Login username', maxLength: 100 })
  username!: string;

  @EmailField({ description: 'Login email' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;
}
