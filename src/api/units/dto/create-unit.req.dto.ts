import { UnitScope } from '../../../database/schemas';
import { EnumField, StringField } from '../../../decorators/field.decorators';

export class CreateUnitReqDto {
  @StringField({ maxLength: 50, description: 'Unit code' })
  code!: string;

  @StringField({ maxLength: 100, description: 'Unit name, e.g. Cái' })
  name!: string;

  @EnumField(() => UnitScope, {
    each: true,
    description: 'Kinds of entity this unit may be assigned to',
  })
  scopes!: UnitScope[];
}
