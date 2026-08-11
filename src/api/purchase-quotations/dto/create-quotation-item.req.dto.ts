import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { CreateQuotationItemSupplierReqDto } from './create-quotation-item-supplier.req.dto';

export class CreateQuotationItemReqDto {
  @UUIDField({
    description: 'Id dòng đề xuất mua hàng (purchase_request_items)',
  })
  readonly purchaseRequestItemId!: string;

  @NumberField({
    isPositive: true,
    description: 'SL báo giá — một lần cho vật tư, không nhân theo số NCC',
  })
  readonly quantity!: number;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Lý do khi SL báo giá khác SL đề xuất',
  })
  readonly quantityAdjustmentReason?: string;

  @ClassField(() => CreateQuotationItemSupplierReqDto, {
    each: true,
    description: 'Danh sách NCC được hỏi giá cho vật tư này',
  })
  readonly suppliers!: CreateQuotationItemSupplierReqDto[];
}
