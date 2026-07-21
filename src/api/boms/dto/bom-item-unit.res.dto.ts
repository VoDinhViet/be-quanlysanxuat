import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight unit (ĐVT) reference, derived from the item's linked product/material. */
@Exclude()
export class BomItemUnitResDto {
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
