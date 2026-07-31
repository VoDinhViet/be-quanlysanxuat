import {
  StockReceiptReason,
  StockReceiptType,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { StockReceiptItemReqDto } from './stock-receipt-item.req.dto';

export class UpdateStockReceiptReqDto {
  @EnumFieldOptional(() => StockReceiptType)
  readonly type?: StockReceiptType;

  @EnumFieldOptional(() => StockReceiptReason)
  readonly reason?: StockReceiptReason;

  @DateFieldOptional({ description: 'Ngày chứng từ' })
  readonly receiptDate?: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassFieldOptional(() => StockReceiptItemReqDto, { each: true })
  readonly items?: StockReceiptItemReqDto[];
}
