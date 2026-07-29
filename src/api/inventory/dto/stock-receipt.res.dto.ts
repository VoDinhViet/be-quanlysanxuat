import { Exclude, Expose } from 'class-transformer';

import {
  StockReceiptReason,
  StockReceiptType,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { StockReceiptCreatorResDto } from './stock-receipt-creator.res.dto';
import { StockReceiptItemResDto } from './stock-receipt-item.res.dto';

@Exclude()
export class StockReceiptResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @EnumField(() => StockReceiptType)
  type!: StockReceiptType;

  @Expose()
  @EnumField(() => StockReceiptReason)
  reason!: StockReceiptReason;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  receiptDate!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => StockReceiptItemResDto, { each: true })
  items!: StockReceiptItemResDto[];

  @Expose()
  @ClassFieldOptional(() => StockReceiptCreatorResDto, { nullable: true })
  creator!: StockReceiptCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
