import { StringField } from '../../../decorators/field.decorators';

/** `POST /production-jobs/:jobId/cancel`. `reason` bắt buộc — huỷ một Job đã duyệt (`production:approve`)
 * là quyết định cấp quản lý, luôn phải ghi rõ lý do vào `cancelReason` + nội dung log. */
export class CancelProductionJobReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do huỷ Job' })
  readonly reason!: string;
}
