import {
  DateFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { UserGender, UserStatus } from '../../../database/schemas';

export class UpdateUserReqDto {
  @EmailFieldOptional({ description: 'Email address' })
  email?: string;

  @StringFieldOptional({ nullable: true, maxLength: 255 })
  fullName?: string | null;

  @StringFieldOptional({ nullable: true, maxLength: 30 })
  phoneNumber?: string | null;

  @DateFieldOptional({ nullable: true })
  dateOfBirth?: Date | null;

  @EnumFieldOptional(() => UserGender, { nullable: true })
  gender?: UserGender | null;

  @UUIDFieldOptional({ nullable: true })
  roleId?: string | null;

  @StringFieldOptional({ description: 'User unique code', maxLength: 50 })
  code?: string;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;
}
