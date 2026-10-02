import {
  BooleanFieldOptional,
  StringField,
} from '../../../decorators/field.decorators';

export class CancelPurchaseOrderReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do huỷ' })
  readonly reason!: string;

  @BooleanFieldOptional({
    description:
      'Mở lại RFQ sinh ra PO này (APPROVED → DRAFT) để sửa giá và duyệt lại. Bỏ trống/false = chỉ huỷ PO, RFQ giữ nguyên. Bỏ qua nếu PO không thuộc RFQ APPROVED; bị chặn nếu RFQ còn PO ORDERED khác (E133)',
  })
  readonly reopenQuotation?: boolean;
}
