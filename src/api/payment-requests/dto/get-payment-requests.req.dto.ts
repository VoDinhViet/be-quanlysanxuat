import { PaymentRequestStatus } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  BooleanFieldOptional,
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

  @BooleanFieldOptional({
    description: 'Filter: true = chỉ YCTT gấp, false = chỉ YCTT bình thường',
  })
  readonly isUrgent?: boolean;

  @DateFieldOptional({ description: 'Filter: ngày tạo >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: ngày tạo <= endDate' })
  readonly endDate?: Date;
}
