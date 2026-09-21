import { Exclude, Expose } from 'class-transformer';

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
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { PositionRefResDto } from '../../positions/dto/position-ref.res.dto';
import { RoleRefResDto } from './credential.res.dto';

@Exclude()
export class PageUserResDto {
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
  @EmailFieldOptional({
    nullable: true,
    description: 'Email đăng nhập (credentials.email)',
  })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;

  @Expose()
  @FileField('avatarFile', 'Avatar file')
  avatar!: FileResDto | null;

  @Expose()
  @ClassField(() => DepartmentResDto)
  department!: DepartmentResDto;

  @Expose()
  @ClassField(() => PositionRefResDto)
  position!: PositionRefResDto;

  @Expose()
  @ClassFieldOptional(() => RoleRefResDto, {
    nullable: true,
    description:
      'Vai trò gán qua credential đăng nhập, null nếu chưa có credential hoặc chưa gán role',
  })
  role!: RoleRefResDto | null;

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
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
