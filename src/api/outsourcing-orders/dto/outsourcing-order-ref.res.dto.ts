import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Không dùng `PickType(OutsourcingOrderResDto, ...)` — DTO đó nhúng `OutsourcingReceiptRefResDto`
// (field `receipts`), mà `OutsourcingReceiptResDto` lại nhúng chính DTO này (field
// `outsourcingOrder`), sẽ tạo vòng import. Khai riêng, chỉ vài field, không phụ thuộc gì bên
// `outsourcing-receipts/` — cùng khuôn `supplier-return-ref.res.dto.ts`.
@Exclude()
export class OutsourcingOrderRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @NumberField({ description: 'SL gửi' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;
}
