import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  StockReceiptReason,
  StockReceiptType,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetStockReceiptsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => StockReceiptType)
  readonly type?: StockReceiptType;

  @EnumFieldOptional(() => StockReceiptReason)
  readonly reason?: StockReceiptReason;

  @UUIDFieldOptional({
    description: 'Filter: receipt has a line for this product',
  })
  readonly productId?: string;

  @DateFieldOptional({ description: 'Filter: receiptDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: receiptDate <= toDate' })
  readonly toDate?: Date;
}
