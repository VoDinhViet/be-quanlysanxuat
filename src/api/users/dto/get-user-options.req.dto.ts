import { StringFieldOptional } from '../../../decorators/field.decorators';

export class GetUserOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on code or full name (accent-insensitive)',
  })
  readonly q?: string;
}
