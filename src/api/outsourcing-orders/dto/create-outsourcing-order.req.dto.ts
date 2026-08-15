import {
  DateField,
  DateFieldOptional,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateOutsourcingOrderReqDto {
  @UUIDField({
    description:
      'Công đoạn as-used của Job (production_job_operations) — bắt buộc snapshot type=OUTSOURCE, Job đang IN_PROGRESS',
  })
  productionJobOperationId!: string;

  @UUIDField({ description: 'NCC gia công' })
  supplierId!: string;

  @UUIDField({ description: 'Kho xuất hàng đi' })
  warehouseId!: string;

  @NumberField({ isPositive: true, description: 'SL gửi' })
  quantity!: number;

  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;

  @DateFieldOptional({ nullable: true, description: 'Ngày hẹn về' })
  expectedReturnDate?: Date | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú',
  })
  note?: string | null;
}
