import {
  DateFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { UserGender, UserStatus } from '../../../database/schemas';

export class UpdateUserReqDto {
  @StringFieldOptional({ description: 'Username', maxLength: 100 })
  username?: string;

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

  @StringFieldOptional({ description: 'User unique code', maxLength: 50 })
  code?: string;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;
}
