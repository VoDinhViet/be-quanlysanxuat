import { StringFieldOptional } from '../../../decorators/field.decorators';

/**
 * Not paginated on purpose: `GET /clients/options` feeds a dropdown, so it always returns the
 * whole catalogue — same reasoning as `GET /units`/`GET /countries`/`GET /roles`. Capped at
 * `ClientsService.OPTIONS_LIMIT` (100) instead of true pagination, since `clients` (unlike those
 * hand-curated catalogues) grows via bulk-seeded/imported data.
 */
export class GetClientOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
