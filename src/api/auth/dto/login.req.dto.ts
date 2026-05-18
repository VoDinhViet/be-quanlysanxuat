import { EmailField, PasswordField } from '../../../decorators/field.decorators';

export class LoginReqDto {
  @EmailField({ description: 'Email address' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;
}
