import { UnitScope } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateUnitReqDto {
  @StringFieldOptional({ maxLength: 50, description: 'Unit code' })
  code?: string;

  @StringFieldOptional({ maxLength: 100, description: 'Unit name, e.g. Cái' })
  name?: string;

  @EnumFieldOptional(() => UnitScope, {
    each: true,
    description: 'Kinds of entity this unit may be assigned to',
  })
  scopes?: UnitScope[];
}
