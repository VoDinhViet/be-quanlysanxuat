import {
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class OutsourcingOrderItemReqDto {
  @UUIDField({
    description:
      'Công đoạn as-used của Job (production_job_operations) — bắt buộc snapshot type=OUTSOURCE, Job đang IN_PROGRESS',
  })
  readonly productionJobOperationId!: string;

  @UUIDField({ description: 'Job sở hữu công đoạn trên (snapshot từ popup)' })
  readonly productionJobId!: string;

  @UUIDField({
    description: 'Mặt hàng WIP của công đoạn trên (snapshot từ popup)',
  })
  readonly itemId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Công đoạn danh mục (operations) — null nếu snapshot mất liên kết',
  })
  readonly operationId?: string | null;

  @StringField({
    maxLength: 50,
    description: 'Mã công đoạn (snapshot từ popup)',
  })
  readonly operationCode!: string;

  @StringField({
    maxLength: 255,
    description: 'Tên công đoạn (snapshot từ popup)',
  })
  readonly operationName!: string;

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
