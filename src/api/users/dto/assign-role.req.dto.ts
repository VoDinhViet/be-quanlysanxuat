import { UUIDField } from '../../../decorators/field.decorators';

export class AssignRoleReqDto {
  @UUIDField({
    description:
      'Role id to assign to the user (applied to their login credential)',
  })
  readonly roleId!: string;
}
