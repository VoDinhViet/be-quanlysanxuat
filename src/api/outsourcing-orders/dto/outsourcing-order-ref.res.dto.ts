import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Không dùng `PickType(OutsourcingOrderResDto, ...)` — `OutsourcingReceiptResDto` nhúng DTO này
// (field `outsourcingOrder`), tạo vòng import nếu đi ngược lại. Khai riêng, chỉ vài field, không
// phụ thuộc gì bên `outsourcing-receipts/` — cùng khuôn `supplier-return-ref.res.dto.ts`.
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
  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;
}
