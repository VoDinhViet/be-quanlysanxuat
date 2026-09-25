import { UnitStatus, UnitType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class GetUnitsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => UnitType, { description: 'Filter by unit type' })
  readonly type?: UnitType;

  @EnumFieldOptional(() => UnitStatus)
  readonly status?: UnitStatus;
}
