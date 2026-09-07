import { PaymentRequestStatus } from '../../../database/schemas';
import {
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

  @DateFieldOptional({ description: 'Filter: ngày tạo >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: ngày tạo <= endDate' })
  readonly endDate?: Date;
}
