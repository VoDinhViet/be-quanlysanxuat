import { Exclude, Expose } from 'class-transformer';

import type { PermissionCode } from '../../../constants/permission.constant';
import { StringField } from '../../../decorators/field.decorators';

@Exclude()
export class CurrentPermissionsResDto {
  @Expose()
  @StringField({
    each: true,
    description:
      'Effective permission codes (includes system:manage for the ADMIN role)',
  })
  permissions!: PermissionCode[];
}
