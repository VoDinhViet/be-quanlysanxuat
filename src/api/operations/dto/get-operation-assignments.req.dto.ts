import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

/** Phân trang + tìm kiếm (`q` theo mã hoặc họ tên) và lọc theo phòng ban / chức vụ nhân sự được
 * phân công vào một công đoạn. */
export class GetOperationAssignmentsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Lọc theo phòng ban' })
  readonly departmentId?: string;

  @UUIDFieldOptional({ description: 'Lọc theo chức vụ' })
  readonly positionId?: string;
}
