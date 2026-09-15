import { Exclude, Expose } from 'class-transformer';

import type { PermissionCode } from '../../../constants/permission.constant';
import {
  ClassField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class PermissionItemResDto {
  @Expose()
  @StringField({ description: 'Permission code string, e.g. orders:read' })
  code!: PermissionCode;

  @Expose()
  @StringField({ description: 'Action key, e.g. read, create, update' })
  action!: string;

  @Expose()
  @StringField({ description: 'Vietnamese display label for the action' })
  label!: string;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Detailed functional description' })
  description?: string;
}

@Exclude()
export class PermissionGroupResDto {
  @Expose()
  @StringField({ description: 'Resource identifier, e.g. orders' })
  resource!: string;

  @Expose()
  @StringField({
    description: 'Resource Vietnamese display label, e.g. Đơn hàng (SO)',
  })
  label!: string;

  @Expose()
  @StringField({
    description: 'Resource functional description',
  })
  description!: string;

  @Expose()
  @StringField({
    each: true,
    description: 'All permission codes belonging to this resource group',
  })
  codes!: PermissionCode[];

  @Expose()
  @ClassField(() => PermissionItemResDto, {
    isArray: true,
    description: 'Detailed permission items in this group',
  })
  permissions!: PermissionItemResDto[];
}
