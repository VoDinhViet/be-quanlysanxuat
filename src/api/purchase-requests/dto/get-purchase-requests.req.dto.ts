import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { PurchaseRequestStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetPurchaseRequestsReqDto extends PageOptionsDto {
  @StringFieldOptional({
    description: 'Tìm theo tên hoặc mã vật tư có trong các dòng của đề xuất',
  })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({
    description: 'Filter theo LSX (production order) liên quan',
  })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({ description: 'Filter theo Job đã sinh ra đề xuất' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo người đề xuất (users.id)' })
  readonly requesterId?: string;

  @UUIDFieldOptional({ description: 'Filter theo bộ phận' })
  readonly departmentId?: string;

  @EnumFieldOptional(() => PurchaseRequestStatus)
  readonly status?: PurchaseRequestStatus;

  @DateFieldOptional({ description: 'Filter: neededDate = ngày này' })
  readonly neededDate?: Date;

  @DateFieldOptional({ description: 'Filter: createdAt >= createdStartDate' })
  readonly createdStartDate?: Date;

  @DateFieldOptional({ description: 'Filter: createdAt <= createdEndDate' })
  readonly createdEndDate?: Date;
}
