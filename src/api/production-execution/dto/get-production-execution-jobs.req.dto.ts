import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { JobOperationProgress } from '../production-execution.constant';

export class GetProductionExecutionJobsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({
    description:
      'Công đoạn đang chọn (operations.id). Bỏ trống = "Tất cả công đoạn" người dùng được phép: mỗi dòng là một cặp Job × công đoạn',
  })
  readonly operationId?: string;

  @EnumFieldOptional(() => JobOperationProgress, {
    description: 'Lọc theo trạng thái công đoạn (cột operationStatus của dòng)',
  })
  readonly operationStatus?: JobOperationProgress;

  @UUIDFieldOptional({ description: 'Lọc theo khách hàng' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= endDate' })
  readonly endDate?: Date;
}
