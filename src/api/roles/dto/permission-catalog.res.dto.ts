import { Exclude, Expose } from 'class-transformer';

import type { PermissionCode } from '../../../constants/permission.constant';
import { ClassField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class PermissionItemResDto {
  @Expose()
  @StringField({ description: 'Full permission code, e.g. clients:create' })
  code!: PermissionCode;

  @Expose()
  @StringField({ description: 'Action part, e.g. create' })
  action!: string;
}

@Exclude()
export class PermissionGroupResDto {
  @Expose()
  @StringField({
    description: 'Resource the permissions belong to, e.g. clients',
  })
  resource!: string;

  @Expose()
  @ClassField(() => PermissionItemResDto, { each: true })
  permissions!: PermissionItemResDto[];
}
