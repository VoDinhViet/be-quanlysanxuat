import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetProductLedgerReqDto extends PageOptionsDto {
  @DateFieldOptional({ description: 'Filter: transactionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: transactionDate <= endDate' })
  readonly endDate?: Date;

  @UUIDFieldOptional({
    description: 'Chỉ xem giao dịch ở kho này — bỏ trống thì gộp mọi kho',
  })
  readonly warehouseId?: string;
}
