import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ProductionJobStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetProductionJobsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by source order id' })
  readonly orderId?: string;

  @EnumFieldOptional(() => ProductionJobStatus)
  readonly status?: ProductionJobStatus;

  @UUIDFieldOptional({ description: 'Filter by product id' })
  readonly productId?: string;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @DateFieldOptional({ description: 'Filter: order.dueDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: order.dueDate <= toDate' })
  readonly toDate?: Date;
}
