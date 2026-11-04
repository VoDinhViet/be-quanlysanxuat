import { StringField } from '../../../decorators/field.decorators';
import { TRACE_CODE_FIELD_OPTIONS } from '../traces.constant';

export class GetPurchaseTraceReqDto {
  @StringField({
    ...TRACE_CODE_FIELD_OPTIONS,
    description:
      'Mã đề nghị mua, đơn mua (DMH), phiếu nhập, phiếu kiểm IQC, phiếu trả nhà cung cấp hoặc đề nghị thanh toán',
  })
  readonly code!: string;
}
