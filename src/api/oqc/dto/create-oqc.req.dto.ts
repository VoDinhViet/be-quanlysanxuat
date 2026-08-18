import {
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateOqcReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description: 'Mã OQC; tự sinh (OQC-{năm}-xxxxx) nếu không truyền',
  })
  readonly code?: string;

  @UUIDField({
    description:
      'Công đoạn (production_job_operations) của Job đang IN_PROGRESS cần kiểm',
  })
  readonly productionJobOperationId!: string;

  @NumberField({
    isPositive: true,
    description: 'Lot size (SL sản xuất thực tế)',
  })
  readonly quantity!: number;

  @DateField({ description: 'Ngày kiểm' })
  readonly inspectionDate!: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;
}
