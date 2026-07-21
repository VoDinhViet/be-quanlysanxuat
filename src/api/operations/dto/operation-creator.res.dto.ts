import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to the user who created an operation, nested inside OperationResDto. */
@Exclude()
export class OperationCreatorResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  username!: string;
}
