import { StringFieldOptional } from '../../../decorators/field.decorators';

/**
 * Not paginated on purpose: `roles` is a small, curated catalogue (created/edited through the
 * role management screen, not bulk data) — same reasoning as `GET /units`.
 */
export class GetRolesReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
