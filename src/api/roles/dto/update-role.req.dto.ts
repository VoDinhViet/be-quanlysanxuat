import type { PermissionCode } from '../../../constants/permission.constant';
import { PERMISSION_CODES } from '../../../constants/permission.constant';
import { StringFieldOptional } from '../../../decorators/field.decorators';

/**
 * `code` is intentionally omitted — it is a stable identifier and not editable after creation.
 */
export class UpdateRoleReqDto {
  @StringFieldOptional({ maxLength: 100, description: 'Display name' })
  readonly name?: string;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly description?: string | null;

  @StringFieldOptional({
    each: true,
    enum: PERMISSION_CODES,
    description: 'Permission codes',
  })
  readonly permissions?: PermissionCode[];
}
