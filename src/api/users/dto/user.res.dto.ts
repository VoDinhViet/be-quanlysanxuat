import { Exclude, Expose, Transform } from 'class-transformer';

import { UserGender, UserStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EmailFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { toFileResDto } from '../../files/dto/to-file-res.dto.util';
import { NamedRefResDto } from './named-ref.res.dto';
import { UserCredentialResDto } from './user-credential.res.dto';

@Exclude()
export class UserResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'User code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Full name' })
  fullName!: string;

  @Expose()
  @EnumField(() => UserGender)
  gender!: UserGender;

  @Expose()
  @DateFieldOptional({ nullable: true })
  dateOfBirth!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  idNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @EmailFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;

  @Expose()
  // `toClassOnly`: the global ClassSerializerInterceptor serialises this DTO a second
  // time, and on that pass `obj` is the DTO instance — which has no `avatarFile` — so an
  // unrestricted transform would overwrite the resolved file with null.
  @Transform(({ obj }: { obj: { avatarFile?: unknown } }) => toFileResDto(obj.avatarFile), {
    toClassOnly: true,
  })
  @ClassFieldOptional(() => FileResDto, { nullable: true, description: 'Avatar file' })
  avatar!: FileResDto | null;

  @Expose()
  @ClassField(() => NamedRefResDto)
  department!: NamedRefResDto;

  @Expose()
  @ClassField(() => NamedRefResDto)
  position!: NamedRefResDto;

  @Expose()
  @DateField({ description: 'Hire date' })
  hireDate!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => UserStatus)
  status!: UserStatus;

  @Expose()
  @ClassFieldOptional(() => UserCredentialResDto, { nullable: true })
  credential!: UserCredentialResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
