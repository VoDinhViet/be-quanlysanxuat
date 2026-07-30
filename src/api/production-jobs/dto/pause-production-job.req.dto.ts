import { StringFieldOptional } from '../../../decorators/field.decorators';

/** `POST /production-jobs/:jobId/pause`. Không có cột riêng lưu lý do — `reason` chỉ đi vào nội
 * dung log (`production_job_logs`), vì tạm dừng lặp lại được nên một cột sẽ bị ghi đè mất lịch sử. */
export class PauseProductionJobReqDto {
  @StringFieldOptional({
    maxLength: 1000,
    description: 'Lý do tạm dừng, đính kèm vào nội dung log',
  })
  readonly reason?: string;
}
