import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UserStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetUsersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => UserStatus, { description: 'Filter by user status' })
  readonly status?: UserStatus;

  @UUIDFieldOptional({ description: 'Filter by department id' })
  readonly departmentId?: string;

  @UUIDFieldOptional({ description: 'Filter by position id' })
  readonly positionId?: string;

  @UUIDFieldOptional({
    description:
      'Bỏ qua nhân sự đã được phân công vào công đoạn này (dùng cho hộp thoại phân công — chỉ liệt kê người chưa thuộc công đoạn)',
  })
  readonly excludeOperationId?: string;
}
