import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderStatus } from '../../../database/schemas';
import {
  DOCUMENT_CODE_MAX_LENGTH,
  DOCUMENT_CODE_PATTERN,
} from '../../../common/summary/summary.constant';
import { LimitReqDto } from '../../../common/summary/summary.dto';

export class GetOrderProgressReqDto extends LimitReqDto {
  @StringFieldOptional({
    pattern: DOCUMENT_CODE_PATTERN,
    patternMessage: 'Mã đơn chỉ gồm chữ, số, . _ / -',
    maxLength: DOCUMENT_CODE_MAX_LENGTH,
    description: 'Có mã đơn thì chỉ trả đơn đó, bất kể trạng thái',
  })
  readonly orderCode?: string;

  @EnumFieldOptional(() => OrderStatus, {
    description: 'Mặc định AWAITING_PRODUCTION và IN_PROGRESS',
  })
  readonly status?: OrderStatus;
}
