import {
  StockReceiptReason,
  StockReceiptType,
} from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { StockReceiptItemReqDto } from './stock-receipt-item.req.dto';

/**
 * `reason` must belong to `type` (see `StockReceiptsService.ensureReasonMatchesType`) — IN takes
 * PRODUCTION/OPENING/STOCKTAKE/OTHER, OUT takes DELIVERY/STOCKTAKE/OTHER.
 */
export class CreateStockReceiptReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description: 'Mã phiếu; tự sinh (PNxxxx/PXxxxx) nếu không truyền',
  })
  readonly code?: string;

  @EnumField(() => StockReceiptType)
  readonly type!: StockReceiptType;

  @EnumField(() => StockReceiptReason)
  readonly reason!: StockReceiptReason;

  @DateField({ description: 'Ngày chứng từ' })
  readonly receiptDate!: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => StockReceiptItemReqDto, { each: true })
  readonly items!: StockReceiptItemReqDto[];
}
