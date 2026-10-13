import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class NcrOperationResDto {
  @Expose()
  @UUIDField({ description: 'Id công đoạn (master)' })
  operationId!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;
}
