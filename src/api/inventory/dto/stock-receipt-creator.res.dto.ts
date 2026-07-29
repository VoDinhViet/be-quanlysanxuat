import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Lightweight reference to the user who created a stock receipt, nested inside StockReceiptResDto. */
@Exclude()
export class StockReceiptCreatorResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  username!: string;
}
