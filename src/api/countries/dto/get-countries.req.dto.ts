import { StringFieldOptional } from '../../../decorators/field.decorators';

export class GetCountriesReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
