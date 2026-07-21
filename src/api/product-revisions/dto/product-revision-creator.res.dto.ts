import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to the user who created a revision, nested inside ProductRevisionResDto. */
@Exclude()
export class ProductRevisionCreatorResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  username!: string;
}
