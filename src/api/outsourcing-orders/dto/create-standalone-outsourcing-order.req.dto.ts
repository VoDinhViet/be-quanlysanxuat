import {
  ClassField,
  DateField,
  DateFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class StandaloneOutsourcingOrderItemReqDto {
  @StringField({
    maxLength: 50,
    trim: true,
    description: 'Mã sản phẩm/chi tiết gửi đi',
  })
  readonly itemCode!: string;

  @StringField({
    maxLength: 255,
    trim: true,
    description: 'Tên sản phẩm/chi tiết gửi đi',
  })
  readonly itemName!: string;

  @UUIDField({ description: 'Đơn vị tính' })
  readonly unitId!: string;

  @NumberField({
    min: 0.001,
    max: 1_000_000_000_000,
    description: 'SL gửi (tối đa 3 số thập phân)',
  })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    max: 999_999_999.999,
    description: 'Trọng lượng (kg)',
  })
  readonly weight?: number;

  @NumberFieldOptional({
    min: 0,
    max: 999_999_999.999,
    description: 'Diện tích (m²)',
  })
  readonly area?: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú dòng' })
  readonly note?: string;
}

export class CreateStandaloneOutsourcingOrderReqDto {
  @UUIDField({ description: 'NCC gia công' })
  readonly supplierId!: string;

  @UUIDField({
    description:
      'Công đoạn gia công ngoài (operations, type=OUTSOURCE, đang hoạt động) áp cho cả phiếu',
  })
  readonly operationId!: string;

  @DateField({ description: 'Ngày gửi' })
  readonly sendDate!: Date;

  @DateFieldOptional({ nullable: true, description: 'Ngày hẹn về' })
  readonly expectedReturnDate?: Date | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú',
  })
  readonly note?: string | null;

  @ClassField(() => StandaloneOutsourcingOrderItemReqDto, { each: true })
  readonly items!: StandaloneOutsourcingOrderItemReqDto[];
}
