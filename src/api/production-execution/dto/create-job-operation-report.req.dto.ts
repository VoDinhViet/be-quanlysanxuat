import {
  DateField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateJobOperationReportReqDto {
  @NumberField({ min: 0, description: 'SL hoàn thành (đạt) cộng thêm lần này' })
  readonly completedQuantityDelta!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'SL không đạt (NG) cộng thêm lần này',
  })
  readonly rejectedQuantityDelta?: number;

  @DateField({ description: 'Ngày hoàn thành' })
  readonly completedDate!: Date;

  @StringFieldOptional({ maxLength: 1000, description: 'Ghi chú' })
  readonly note?: string;

  @UUIDFieldOptional({
    each: true,
    description:
      'File ids ảnh đính kèm (from POST /files, type=PRODUCTION_OPERATION_EVIDENCE)',
  })
  readonly imageFileIds?: string[];
}
