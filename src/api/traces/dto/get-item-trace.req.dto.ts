import { StringField } from '../../../decorators/field.decorators';
import { TRACE_CODE_FIELD_OPTIONS } from '../traces.constant';

export class GetItemTraceReqDto {
  @StringField({
    ...TRACE_CODE_FIELD_OPTIONS,
    description: 'Mã vật tư hoặc sản phẩm',
  })
  readonly itemCode!: string;
}
