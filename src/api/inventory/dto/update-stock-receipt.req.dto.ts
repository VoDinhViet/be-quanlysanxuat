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

/**
 * No `code` field — immutable after creation, same convention as `UpdateOrderReqDto`. `items` is
 * replace-all: sending `[]` clears every line, omitting the field keeps the existing set. When
 * only one of `type`/`reason` is sent, the pair is re-validated against the row's *effective*
 * value for the other (same idea as `MaterialsService.updateMaterial`'s (type, clientId) check).
 */
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
