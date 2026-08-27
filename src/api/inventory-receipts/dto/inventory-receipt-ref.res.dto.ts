import { Exclude, Expose } from 'class-transformer';

import {
  InventoryDocumentStatus,
  InventoryReceiptType,
} from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class InventoryReceiptRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @EnumField(() => InventoryReceiptType)
  receiptType!: InventoryReceiptType;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  receiptDate!: Date;
}
