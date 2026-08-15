import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Không dùng `PickType(SupplierReturnBaseResDto, ...)` — DTO đó import `IqcRefResDto`, sẽ tạo
// vòng import với `iqc.res.dto.ts` (nơi field `supplierReturn` này được dùng). Khai riêng, chỉ 3
// field, không phụ thuộc gì bên `iqc/`.
@Exclude()
export class SupplierReturnRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã trả NCC' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;
}
