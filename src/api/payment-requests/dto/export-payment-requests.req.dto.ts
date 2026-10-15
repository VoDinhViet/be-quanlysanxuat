import { PaymentRequestStatus } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportPaymentRequestsReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @StringFieldOptional({ description: 'Tìm theo mã PO' })
  readonly poCode?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => PaymentRequestStatus)
  readonly status?: PaymentRequestStatus;

  @BooleanFieldOptional({
    description: 'Filter: true = chỉ YCTT gấp, false = chỉ YCTT bình thường',
  })
  readonly isUrgent?: boolean;

  @DateFieldOptional({ description: 'Filter: ngày tạo >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: ngày tạo <= endDate' })
  readonly endDate?: Date;
}
