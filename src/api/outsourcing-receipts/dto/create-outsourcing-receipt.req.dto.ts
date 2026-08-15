import {
  BooleanFieldOptional,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateOutsourcingReceiptReqDto {
  @UUIDField({ description: 'Phiếu gửi (OS-OUT) đang nhận về, phải POSTED' })
  outsourcingOrderId!: string;

  @NumberField({ isPositive: true, description: 'SL nhận đợt này' })
  quantity!: number;

  @DateField({ description: 'Ngày nhận' })
  receiptDate!: Date;

  @UUIDFieldOptional({
    description: 'Kho nhận — bỏ trống thì lấy kho gửi của OS-OUT',
  })
  warehouseId?: string;

  @BooleanFieldOptional({
    description: 'Yêu cầu QC — sinh IQC lúc post nếu true',
  })
  requiresIqc?: boolean;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú',
  })
  note?: string | null;
}
