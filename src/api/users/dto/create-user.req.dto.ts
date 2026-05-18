import {
  EmailField,
  EnumFieldOptional,
  PasswordField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { UserStatus } from '../../../database/schemas';

export class CreateUserReqDto {
  @EmailField({ description: 'Email address' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;

  @StringFieldOptional({ nullable: true, maxLength: 255 })
  fullName?: string | null;

  @UUIDFieldOptional({ nullable: true })
  roleId?: string | null;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;
}
