import { StringFieldOptional } from '../../../decorators/field.decorators';

export class GetRolesReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
