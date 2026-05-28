import {
  EmailFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { UserStatus } from '../../../database/schemas';

export class UpdateUserReqDto {
  @EmailFieldOptional({ description: 'Email address' })
  email?: string;

  @StringFieldOptional({ nullable: true, maxLength: 255 })
  fullName?: string | null;

  @UUIDFieldOptional({ nullable: true })
  roleId?: string | null;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;
}
