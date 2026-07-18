import type { PermissionCode } from '../../../constants/permission.constant';
import { PERMISSION_CODES } from '../../../constants/permission.constant';
import { StringField, StringFieldOptional } from '../../../decorators/field.decorators';

export class CreateRoleReqDto {
  @StringField({ maxLength: 50, toUpperCase: true, description: 'Stable role code' })
  readonly code!: string;

  @StringField({ maxLength: 100, description: 'Display name' })
  readonly name!: string;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly description?: string | null;

  // Membership in the PERMISSION_CODES catalogue is enforced in the service (ErrorCode.E031);
  // the `enum` here only powers the Swagger dropdown.
  @StringField({ each: true, enum: PERMISSION_CODES, description: 'Permission codes' })
  readonly permissions!: PermissionCode[];
}
