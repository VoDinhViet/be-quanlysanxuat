import { Exclude, Expose } from 'class-transformer';

import type { PermissionCode } from '../../../constants/permission.constant';
import {
  ClassField,
  DateField,
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';

@Exclude()
export class RoleRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Stable role code, e.g. ADMIN' })
  code!: string;

  @Expose()
  @StringField({ description: 'Display name' })
  name!: string;
}

@Exclude()
export class CredentialResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringFieldOptional({ description: 'Username', nullable: true })
  username!: string | null;

  @Expose()
  @EmailFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({
    description:
      'Full name from the linked user (employee) profile, or null if none is linked',
    nullable: true,
  })
  fullName!: string | null;

  @Expose()
  @FileField(
    'avatarFile',
    'Avatar file from the linked user (employee) profile, or null if none is linked',
  )
  avatar!: FileResDto | null;

  @Expose()
  @ClassField(() => RoleRefResDto, {
    nullable: true,
    description: 'Role assigned to this login identity, or null if none',
  })
  role!: RoleRefResDto | null;

  @Expose()
  @StringField({
    each: true,
    description:
      'Effective permission codes (includes system:manage for the ADMIN role)',
  })
  permissions!: PermissionCode[];

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
