import { StringField } from '../../../decorators/field.decorators';

/** Body of `POST /orders/:orderId/reject` — a rejection reason is mandatory, matching the
 * "yêu cầu nhập lý do từ chối" business rule. */
export class RejectOrderReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do từ chối' })
  readonly reason!: string;
}
