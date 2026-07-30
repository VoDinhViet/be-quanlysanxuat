import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ProductionOrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** Query cho màn hình chính LSX — mỗi dòng một PO, xem `ProductionOrderResDto`. */
export class GetProductionOrdersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ProductionOrderStatus, {
    description: 'PENDING (Chờ duyệt) | APPROVED (Đã duyệt)',
  })
  readonly status?: ProductionOrderStatus;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= toDate' })
  readonly toDate?: Date;
}
