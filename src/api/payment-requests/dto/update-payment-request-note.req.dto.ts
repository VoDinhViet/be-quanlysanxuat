import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdatePaymentRequestNoteReqDto {
  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú của yêu cầu thanh toán; null hoặc rỗng để xoá',
  })
  readonly note?: string | null;
}
