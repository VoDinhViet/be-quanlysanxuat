import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  StockReceiptReason,
  StockReceiptSubject,
  StockReceiptType,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetStockReceiptsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => StockReceiptSubject)
  readonly subject?: StockReceiptSubject;

  @EnumFieldOptional(() => StockReceiptType)
  readonly type?: StockReceiptType;

  @EnumFieldOptional(() => StockReceiptReason)
  readonly reason?: StockReceiptReason;

  @UUIDFieldOptional({
    description: 'Filter: receipt has a line for this product',
  })
  readonly productId?: string;

  @UUIDFieldOptional({
    description: 'Filter: receipt has a line for this material',
  })
  readonly materialId?: string;

  @DateFieldOptional({ description: 'Filter: receiptDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: receiptDate <= toDate' })
  readonly toDate?: Date;
}
