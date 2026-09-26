import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ProductionJobStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetProductionExecutionJobsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({
    description:
      'Công đoạn đang chọn (operations.id). Bỏ trống = "Tất cả công đoạn" người dùng được phép: mỗi dòng là một cặp Job × công đoạn',
  })
  readonly operationId?: string;

  @EnumFieldOptional(() => ProductionJobStatus, {
    description: 'Lọc theo trạng thái Job',
  })
  readonly status?: ProductionJobStatus;

  @UUIDFieldOptional({ description: 'Lọc theo khách hàng' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= endDate' })
  readonly endDate?: Date;
}
