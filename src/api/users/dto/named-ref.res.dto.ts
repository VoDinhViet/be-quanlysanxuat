import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to a department / position, nested inside UserResDto. */
@Exclude()
export class NamedRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;
}
