import { UUIDField } from '../../../decorators/field.decorators';

export class ApproveQuotationSelectedSupplierReqDto {
  @UUIDField({ description: 'Id dòng vật tư (purchase_quotation_items)' })
  readonly quotationItemId!: string;

  @UUIDField({
    description:
      'Id dòng NCC thắng thầu (purchase_quotation_item_suppliers), phải thuộc đúng quotationItemId',
  })
  readonly quotationItemSupplierId!: string;
}
