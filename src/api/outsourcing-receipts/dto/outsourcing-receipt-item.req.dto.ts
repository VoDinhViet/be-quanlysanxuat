import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class OutsourcingReceiptItemReqDto {
  @UUIDField({
    description:
      'Dòng OS-OUT nguồn (outsourcing_order_items) — phải thuộc phiếu POSTED, cùng NCC với header',
  })
  readonly outsourcingOrderItemId!: string;

  @NumberField({ isPositive: true, description: 'SL nhận đợt này' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Trọng lượng (kg) — mặc định lấy theo dòng OS-OUT, có thể sửa',
  })
  readonly weight?: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Diện tích (m²) — mặc định lấy theo dòng OS-OUT, có thể sửa',
  })
  readonly area?: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú dòng' })
  readonly note?: string;
}
