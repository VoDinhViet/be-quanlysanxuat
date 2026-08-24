import type { PermissionCode } from '../../../constants/permission.constant';
import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateRoleReqDto {
  @StringFieldOptional({
    description: 'Stable role code, e.g. QC',
    maxLength: 50,
  })
  code?: string;

  @StringFieldOptional({ description: 'Display name', maxLength: 255 })
  name?: string;

  @StringFieldOptional({
    description: 'Description',
    nullable: true,
    maxLength: 500,
  })
  description?: string | null;

  @StringFieldOptional({
    each: true,
    description:
      'Permission codes granted to this role — validated against PERMISSION_CODES',
  })
  permissions?: PermissionCode[];
}
