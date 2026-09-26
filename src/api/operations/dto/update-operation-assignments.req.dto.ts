import { UUIDField } from '../../../decorators/field.decorators';

export class UpdateOperationAssignmentsReqDto {
  @UUIDField({
    each: true,
    description:
      'Toàn bộ nhân sự được phân công vào công đoạn (thay thế danh sách hiện tại)',
  })
  userIds!: string[];
}
