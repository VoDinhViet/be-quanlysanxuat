import { StringField } from '../../../decorators/field.decorators';
import { TRACE_CODE_FIELD_OPTIONS } from '../traces.constant';

export class GetOrderTraceReqDto {
  @StringField({
    ...TRACE_CODE_FIELD_OPTIONS,
    description: 'Mã đơn bán (SO) cần truy vết',
  })
  readonly orderCode!: string;
}
