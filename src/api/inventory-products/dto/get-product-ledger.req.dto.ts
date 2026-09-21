import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { DateFieldOptional } from '../../../decorators/field.decorators';

export class GetProductLedgerReqDto extends PageOptionsDto {
  @DateFieldOptional({ description: 'Filter: transactionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: transactionDate <= endDate' })
  readonly endDate?: Date;
}
