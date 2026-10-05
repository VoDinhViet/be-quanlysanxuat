import {
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class ApproveQuotationAllocationReqDto {
  @UUIDField({
    description: 'Id dòng phân bổ (purchase_quotation_item_allocations)',
  })
  readonly allocationId!: string;

  @NumberField({
    isPositive: true,
    description:
      'SL duyệt mua cho dòng phân bổ — không vượt SL báo giá; phần chưa duyệt quay về sổ cái để báo giá lại',
  })
  readonly quantity!: number;

  @StringFieldOptional({
    maxLength: 400,
    description: 'Lý do duyệt thiếu — bắt buộc khi SL duyệt nhỏ hơn SL báo giá',
  })
  readonly reason?: string;
}
