import {
  BooleanFieldOptional,
  ClassField,
  DateField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OutsourcingReceiptItemReqDto } from './outsourcing-receipt-item.req.dto';

export class CreateOutsourcingReceiptReqDto {
  @UUIDField({
    description: 'NCC — mọi dòng OS-OUT được chọn phải cùng NCC này (E187)',
  })
  readonly supplierId!: string;

  @DateField({ description: 'Ngày nhận' })
  readonly receiptDate!: Date;

  @BooleanFieldOptional({
    description: 'Yêu cầu QC — sinh IQC lúc tạo nếu true (1 phiếu/dòng)',
  })
  readonly requiresIqc?: boolean;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú',
  })
  readonly note?: string | null;

  @ClassField(() => OutsourcingReceiptItemReqDto, { each: true })
  readonly items!: OutsourcingReceiptItemReqDto[];
}
