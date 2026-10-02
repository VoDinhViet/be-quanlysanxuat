import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

/** Tham chiếu gọn tới phiếu lãnh — dùng ở phiếu xuất kho sinh ra từ phiếu lãnh đó. */
@Exclude()
export class InventoryRequisitionRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu lãnh' })
  code!: string;
}
