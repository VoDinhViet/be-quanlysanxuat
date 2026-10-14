import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdatePaymentRequestInvoiceReqDto {
  @StringFieldOptional({
    nullable: true,
    maxLength: 100,
    description: 'Số hóa đơn của NCC; null hoặc rỗng để xoá',
  })
  readonly supplierInvoiceNo?: string | null;
}
