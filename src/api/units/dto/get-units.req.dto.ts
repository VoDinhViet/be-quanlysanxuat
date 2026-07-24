import { UnitScope } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Not paginated on purpose: `units` is a small, seeded, read-only catalogue whose only consumer is
 * a dropdown.
 */
export class GetUnitsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => UnitScope, {
    description:
      'Only return units assignable to this kind of entity. Omit for all units.',
  })
  readonly scope?: UnitScope;
}
