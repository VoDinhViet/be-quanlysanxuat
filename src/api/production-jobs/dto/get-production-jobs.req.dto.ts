import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** Query cho "Quản lý sản xuất" — mỗi dòng một Job, xem `ProductionJobResDto`. */
export class GetProductionJobsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by source order id' })
  readonly orderId?: string;

  @UUIDFieldOptional({ description: 'Filter by product id' })
  readonly productId?: string;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= toDate' })
  readonly toDate?: Date;
}
