import {
  PasswordField,
  StringField,
} from '../../../decorators/field.decorators';

export class LoginReqDto {
  @StringField({ description: 'Username hoặc email', toLowerCase: true })
  identifier!: string;

  @PasswordField({ description: 'Password' })
  password!: string;
}
