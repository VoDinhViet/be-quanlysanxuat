import {
  StockReceiptReason,
  StockReceiptSubject,
  StockReceiptType,
} from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { StockReceiptItemReqDto } from './stock-receipt-item.req.dto';

export class CreateStockReceiptReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description:
      'Mã phiếu; tự sinh (PNxxxx/PXxxxx hoặc PNVTxxxx/PXVTxxxx) nếu không truyền',
  })
  readonly code?: string;

  @EnumField(() => StockReceiptSubject, {
    description: 'Kho thành phẩm hay kho vật tư — bất biến sau khi tạo',
  })
  readonly subject!: StockReceiptSubject;

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
