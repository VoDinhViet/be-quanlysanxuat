import { PaymentRequestStatus } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetPaymentRequestsReqDto extends PageOptionsDto {
  @StringFieldOptional({ description: 'Tìm theo mã PO' })
  readonly poCode?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => PaymentRequestStatus)
  readonly status?: PaymentRequestStatus;

  @DateFieldOptional({ description: 'Filter: ngày tạo >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: ngày tạo <= toDate' })
  readonly toDate?: Date;
}
