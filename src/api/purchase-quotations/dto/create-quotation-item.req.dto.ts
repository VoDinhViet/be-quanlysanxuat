import { ClassField, UUIDField } from '../../../decorators/field.decorators';
import { CreateQuotationItemAllocationReqDto } from './create-quotation-item-allocation.req.dto';
import { CreateQuotationItemSupplierReqDto } from './create-quotation-item-supplier.req.dto';

export class CreateQuotationItemReqDto {
  @UUIDField({
    description:
      'Id vật tư (items) — mọi dòng ĐXMH cùng vật tư này gộp vào một dòng báo giá',
  })
  readonly itemId!: string;

  @ClassField(() => CreateQuotationItemAllocationReqDto, {
    each: true,
    description:
      'Phân bổ SL báo giá về các dòng ĐXMH nguồn — tối thiểu 1 phân bổ; SL báo giá của vật tư là tổng các phân bổ',
  })
  readonly allocations!: CreateQuotationItemAllocationReqDto[];

  @ClassField(() => CreateQuotationItemSupplierReqDto, {
    each: true,
    description: 'Danh sách NCC được hỏi giá cho vật tư này',
  })
  readonly suppliers!: CreateQuotationItemSupplierReqDto[];
}
