import { InventoryReceiptType } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  ClassFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryReceiptItemReqDto } from './inventory-receipt-item.req.dto';

/** Chỉ hợp lệ khi phiếu còn `DRAFT` (`E098`). `warehouseId` bất biến — đổi kho là lập phiếu mới. */
export class UpdateInventoryReceiptReqDto {
  @EnumFieldOptional(() => InventoryReceiptType)
  readonly receiptType?: InventoryReceiptType;

  @DateFieldOptional()
  readonly receiptDate?: Date;

  @UUIDFieldOptional()
  readonly supplierId?: string;

  @UUIDFieldOptional()
  readonly purchaseRequestId?: string;

  @UUIDFieldOptional()
  readonly productionOrderId?: string;

  @UUIDFieldOptional({
    description: 'Job liên quan — bắt buộc khi receiptType=PRODUCTION (E179)',
  })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Đơn mua hàng (PO) đã ORDERED' })
  readonly purchaseOrderId?: string;

  @BooleanFieldOptional({
    description:
      'Yêu cầu kiểm tra chất lượng (IQC) — quyết định `confirm` chuyển phiếu sang PENDING_IQC hay PENDING_RECEIPT',
  })
  readonly requiresIqc?: boolean;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassFieldOptional(() => InventoryReceiptItemReqDto, { each: true })
  readonly items?: InventoryReceiptItemReqDto[];
}
