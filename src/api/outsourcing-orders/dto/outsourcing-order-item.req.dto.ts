import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class OutsourcingOrderItemReqDto {
  @UUIDField({
    description:
      'Công đoạn as-used của Job (production_job_operations) — bắt buộc snapshot type=OUTSOURCE, Job đang IN_PROGRESS',
  })
  readonly productionJobOperationId!: string;

  @NumberField({ isPositive: true, description: 'SL gửi lần này' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description:
      'Trọng lượng (kg) — chỉ hiển thị/in phiếu, không tham gia tính tồn',
  })
  readonly weight?: number;

  @NumberFieldOptional({
    min: 0,
    description:
      'Diện tích (m²) — chỉ hiển thị/in phiếu, không tham gia tính tồn',
  })
  readonly area?: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú dòng' })
  readonly note?: string;
}
