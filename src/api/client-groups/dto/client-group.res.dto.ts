import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class ClientGroupResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Client group code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Client group name' })
  name!: string;
}
