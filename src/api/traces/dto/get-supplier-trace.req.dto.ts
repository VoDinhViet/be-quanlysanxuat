import { StringField } from '../../../decorators/field.decorators';
import { TRACE_SUPPLIER_KEYWORD_MAX_LENGTH } from '../traces.constant';

export class GetSupplierTraceReqDto {
  @StringField({
    maxLength: TRACE_SUPPLIER_KEYWORD_MAX_LENGTH,
    description: 'Mã hoặc một phần tên nhà cung cấp',
  })
  readonly supplier!: string;
}
