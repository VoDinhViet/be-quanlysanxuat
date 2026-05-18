import { PasswordField } from '../../../decorators/field.decorators';

export class ChangeUserPasswordReqDto {
  @PasswordField({ description: 'New password' })
  password!: string;
}
