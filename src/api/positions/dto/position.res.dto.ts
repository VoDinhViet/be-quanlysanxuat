import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class PositionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Position code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Position name, e.g. Trưởng phòng' })
  name!: string;
}
