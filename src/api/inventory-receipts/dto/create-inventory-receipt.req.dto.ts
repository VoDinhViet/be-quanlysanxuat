import { InventoryReceiptType } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryReceiptItemReqDto } from './inventory-receipt-item.req.dto';

export class CreateInventoryReceiptReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description: 'Mã phiếu; tự sinh (PNK-{năm}-xxxxx) nếu không truyền',
  })
  readonly code?: string;

  @UUIDField({ description: 'Kho nhận' })
  readonly warehouseId!: string;

  @EnumField(() => InventoryReceiptType)
  readonly receiptType!: InventoryReceiptType;

  @DateField({ description: 'Ngày chứng từ' })
  readonly receiptDate!: Date;

  @UUIDFieldOptional({
    description: 'Nhà cung cấp đã giao (receiptType=PURCHASE)',
  })
  readonly supplierId?: string;

  @UUIDFieldOptional({
    description: 'Đề xuất mua hàng đã sinh ra nhu cầu nhập',
  })
  readonly purchaseRequestId?: string;

  @UUIDFieldOptional({ description: 'LSX liên quan (tuỳ chọn)' })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({
    description:
      'Job liên quan — bắt buộc khi receiptType=PRODUCTION (E179), dùng để gate nhập kho theo OQC PASS',
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

  @ClassField(() => InventoryReceiptItemReqDto, { each: true })
  readonly items!: InventoryReceiptItemReqDto[];
}
