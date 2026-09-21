import { StringFieldOptional } from '../../../decorators/field.decorators';

export class GetUnitsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
