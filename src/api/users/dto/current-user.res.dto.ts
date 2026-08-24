import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { RoleRefResDto } from './credential.res.dto';

@Exclude()
export class CurrentUserResDto {
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
  @StringField({ description: 'Full name from the linked user profile' })
  fullName!: string;

  @Expose()
  @FileField(
    'avatarFile',
    'Avatar file from the linked user (employee) profile, or null if none is linked',
  )
  avatar!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => RoleRefResDto, {
    nullable: true,
    description: 'Role assigned to this login identity, or null if none',
  })
  role!: RoleRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
