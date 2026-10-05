import { ClassField } from '../../../decorators/field.decorators';
import { ApproveQuotationSelectedSupplierReqDto } from './approve-quotation-selected-supplier.req.dto';

export class ApproveQuotationReqDto {
  @ClassField(() => ApproveQuotationSelectedSupplierReqDto, {
    each: true,
    description:
      'NCC thắng thầu cho từng vật tư — bắt buộc đủ mọi vật tư của báo giá',
  })
  readonly selectedSuppliers!: ApproveQuotationSelectedSupplierReqDto[];
}
