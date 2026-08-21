import { IqcDisposition, IqcResult } from '../../../database/schemas';
import {
  DateField,
  EnumFieldOptional,
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateIqcReqDto {
  @UUIDFieldOptional({ description: 'Phiếu nhập kho liên quan (nếu có)' })
  readonly inventoryReceiptId?: string;

  @UUIDFieldOptional({ description: 'PO liên quan (nếu có)' })
  readonly purchaseOrderId?: string;

  @UUIDField({ description: 'Nhà cung cấp' })
  readonly supplierId!: string;

  @UUIDField({ description: 'Vật tư được kiểm' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng kiểm' })
  readonly quantity!: number;

  @DateField({ description: 'Ngày kiểm' })
  readonly inspectionDate!: Date;

  @EnumFieldOptional(() => IqcResult, {
    description: 'Kết quả QC — bỏ trống = tạo dòng chưa kiểm (NOT_INSPECTED)',
  })
  readonly result?: IqcResult;

  @EnumFieldOptional(() => IqcDisposition, {
    description:
      'Quyết định xử lý — chỉ gửi khi result = FAIL. Bỏ trống = Chờ xử lý.',
  })
  readonly disposition?: IqcDisposition;

  @StringFieldOptional({
    maxLength: 255,
    description: 'Lý do kiểm — dùng khi không có PO',
  })
  readonly reason?: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;
}
