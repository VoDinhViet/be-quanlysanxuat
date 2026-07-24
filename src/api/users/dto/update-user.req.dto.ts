import { UserGender, UserStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateUserReqDto {
  @StringFieldOptional({ description: 'Full name', maxLength: 255 })
  fullName?: string;

  @EnumFieldOptional(() => UserGender)
  gender?: UserGender;

  @DateFieldOptional({ nullable: true })
  dateOfBirth?: Date | null;

  @StringFieldOptional({
    description: 'CCCD/CMND number',
    nullable: true,
    maxLength: 20,
  })
  idNumber?: string | null;

  @StringFieldOptional({ nullable: true, maxLength: 30 })
  phoneNumber?: string | null;

  @EmailFieldOptional({ description: 'Personal email', nullable: true })
  email?: string | null;

  @StringFieldOptional({
    description: 'Permanent address',
    nullable: true,
    maxLength: 500,
  })
  address?: string | null;

  @UUIDFieldOptional({
    description: 'Avatar file id (from POST /files?type=USER_AVATAR)',
  })
  avatarFileId?: string | null;

  @UUIDFieldOptional({ description: 'Department id' })
  departmentId?: string;

  @UUIDFieldOptional({ description: 'Position id' })
  positionId?: string;

  @DateFieldOptional({ description: 'Hire date' })
  hireDate?: Date;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  note?: string | null;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;

  // Written to the user's login `credentials` row, NOT to `users` — peel it off before spreading
  // this DTO into `.set(users)`. Requires the caller to hold `roles:update` on top of
  // `users:update` (enforced in `UsersService`, E033), and the user to have a linked credential
  // (E032). Same rules as the dedicated `PATCH /users/:userId/role`.
  @UUIDFieldOptional({
    description: "Role id to assign to this user's login credential",
  })
  roleId?: string;
}
