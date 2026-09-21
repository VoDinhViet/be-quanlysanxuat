import { Exclude, Expose } from 'class-transformer';

import { UnitScope } from '../../../database/schemas';
import {
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class UnitResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Unit code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Unit name, e.g. Cái' })
  name!: string;

  @Expose()
  @EnumField(() => UnitScope, {
    each: true,
    description: 'Kinds of entity this unit may be assigned to',
  })
  scopes!: UnitScope[];
}
