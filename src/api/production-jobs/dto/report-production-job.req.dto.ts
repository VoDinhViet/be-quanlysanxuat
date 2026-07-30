import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Báo sản lượng một lần — `POST /production-jobs/:jobId/report`.
 *
 * Rules:
 * - `producedQty`/`rejectedQty` **cộng dồn** vào số đã có trên Job, không ghi đè.
 * - Ít nhất một trong hai phải > 0 (`E089`); tổng cộng dồn sau khi cộng không được vượt `quantity`
 *   của Job (`E088`).
 */
export class ReportProductionJobReqDto {
  @NumberFieldOptional({ min: 0, description: 'SL đạt báo thêm ở lần này' })
  readonly producedQty?: number;

  @NumberFieldOptional({ min: 0, description: 'SL phế báo thêm ở lần này' })
  readonly rejectedQty?: number;

  @StringFieldOptional({
    maxLength: 1000,
    description: 'Ghi chú, đính kèm vào nội dung log',
  })
  readonly note?: string;
}
