import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  BooleanField,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Không dùng `PickType(OutsourcingReceiptResDto, ...)` — vòng import qua
// `OutsourcingOrderRefResDto`/`OutsourcingOrderResDto`, xem comment ở
// `outsourcing-order-ref.res.dto.ts`. Khai riêng, chỉ vài field.
@Exclude()
export class OutsourcingReceiptRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu nhận gia công ngoài' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @DateField({ description: 'Ngày nhận' })
  receiptDate!: Date;

  @Expose()
  @BooleanField({ description: 'Có yêu cầu QC không' })
  requiresIqc!: boolean;
}
