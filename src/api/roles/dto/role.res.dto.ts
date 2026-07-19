import { Exclude, Expose } from 'class-transformer';

import type { PermissionCode } from '../../../constants/permission.constant';
import {
  BooleanField,
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class RoleResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Stable role code, e.g. ADMIN' })
  code!: string;

  @Expose()
  @StringField({ description: 'Display name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @StringField({ each: true, description: 'Permission codes granted to this role' })
  permissions!: PermissionCode[];

  @Expose()
  @BooleanField({ description: 'System role (protected from edit/delete)' })
  isSystem!: boolean;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
