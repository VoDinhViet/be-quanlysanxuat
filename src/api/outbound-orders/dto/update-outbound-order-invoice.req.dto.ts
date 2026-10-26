import { DateField, StringField } from '../../../decorators/field.decorators';

export class UpdateOutboundOrderInvoiceReqDto {
  @StringField({ maxLength: 100, trim: true, description: 'Số hóa đơn' })
  readonly invoiceNo!: string;

  @DateField({ description: 'Ngày xuất hóa đơn' })
  readonly invoiceDate!: Date;
}
