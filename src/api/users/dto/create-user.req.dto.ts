import { UserGender, UserStatus } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { CreateCredentialReqDto } from './create-credential.req.dto';

export class CreateUserReqDto {
  @StringField({ description: 'Full name', maxLength: 255 })
  fullName!: string;

  @EnumField(() => UserGender)
  gender!: UserGender;

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

  @StringFieldOptional({
    description: 'Permanent address',
    nullable: true,
    maxLength: 500,
  })
  address?: string | null;

  @UUIDFieldOptional({
    description: 'Avatar file id (from POST /files)',
    nullable: true,
  })
  avatarFileId?: string | null;

  @UUIDField({ description: 'Department id' })
  departmentId!: string;

  @UUIDField({ description: 'Position id' })
  positionId!: string;

  @DateField({ description: 'Hire date' })
  hireDate!: Date;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  note?: string | null;

  @EnumFieldOptional(() => UserStatus)
  status?: UserStatus;

  @ClassFieldOptional(() => CreateCredentialReqDto, {
    nullable: true,
    description: 'Provision an ERP login credential for this user',
  })
  credential?: CreateCredentialReqDto | null;
}
