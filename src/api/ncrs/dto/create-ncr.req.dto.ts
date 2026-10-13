import { NcrType } from '../../../database/schemas';
import {
  EnumField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateNcrReqDto {
  @EnumField(() => NcrType, {
    description: 'INTERNAL = NCR-NB, CUSTOMER = NCR-KH',
  })
  readonly type!: NcrType;

  @UUIDField({ description: 'Sản phẩm — 1 NCR = 1 sản phẩm' })
  readonly itemId!: string;

  @UUIDFieldOptional({ description: 'Khách hàng — bắt buộc với NCR-KH' })
  readonly clientId?: string;

  @UUIDFieldOptional({
    description: 'Đơn hàng liên quan — cần có mới tạo được LSX phụ',
  })
  readonly orderId?: string;

  @UUIDFieldOptional({ description: 'Job liên quan (tuỳ chọn)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({
    description: 'Bộ phận phát sinh NCR — bắt buộc với NCR-KH',
  })
  readonly departmentId?: string;

  @NumberFieldOptional({ min: 0, description: 'SL hàng lỗi (mặc định 0)' })
  readonly ngQty?: number;

  @StringFieldOptional({ maxLength: 1000, description: 'Mô tả lỗi' })
  readonly defectDescription?: string;
}
