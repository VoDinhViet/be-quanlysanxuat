import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

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
}
