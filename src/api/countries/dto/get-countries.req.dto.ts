import { StringFieldOptional } from '../../../decorators/field.decorators';

/**
 * Not paginated on purpose: `countries` is a small, seeded, read-only catalogue whose only
 * consumer is a dropdown — same reasoning as `GET /units` and `GET /roles`.
 */
export class GetCountriesReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
