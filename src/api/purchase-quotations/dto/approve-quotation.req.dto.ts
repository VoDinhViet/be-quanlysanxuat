import {
  ClassField,
  ClassFieldOptional,
} from '../../../decorators/field.decorators';
import { ApproveQuotationAllocationReqDto } from './approve-quotation-allocation.req.dto';
import { ApproveQuotationSelectedSupplierReqDto } from './approve-quotation-selected-supplier.req.dto';

export class ApproveQuotationReqDto {
  @ClassField(() => ApproveQuotationSelectedSupplierReqDto, {
    each: true,
    description:
      'NCC thắng thầu cho từng vật tư — bắt buộc đủ mọi vật tư của báo giá',
  })
  readonly selectedSuppliers!: ApproveQuotationSelectedSupplierReqDto[];

  @ClassFieldOptional(() => ApproveQuotationAllocationReqDto, {
    each: true,
    description:
      'Duyệt một phần: SL duyệt cho từng dòng phân bổ muốn giảm — dòng không gửi được duyệt nguyên SL báo giá',
  })
  readonly allocations?: ApproveQuotationAllocationReqDto[];
}
