import {
  InventoryReceiptAssetType,
  InventoryReceiptType,
} from '../../../database/schemas';
import {
  BooleanFieldOptional,
  ClassField,
  DateField,
  EnumField,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryReceiptItemReqDto } from './inventory-receipt-item.req.dto';

export class CreateInventoryReceiptReqDto {
  @UUIDField({ description: 'Kho nhận' })
  readonly warehouseId!: string;

  @EnumField(() => InventoryReceiptType)
  readonly receiptType!: InventoryReceiptType;

  @EnumFieldOptional(() => InventoryReceiptAssetType, {
    description: 'Phân loại tài sản — mặc định COMPANY nếu bỏ trống',
  })
  readonly assetType?: InventoryReceiptAssetType;

  @DateField({ description: 'Ngày chứng từ' })
  readonly receiptDate!: Date;

  @UUIDFieldOptional({
    description:
      'Nhà cung cấp đã giao (receiptType=PURCHASE) — loại trừ lẫn nhau với clientId',
  })
  readonly supplierId?: string;

  @UUIDFieldOptional({
    description:
      'Khách hàng gửi trả (receiptType=RETURN) — loại trừ lẫn nhau với supplierId (E253)',
  })
  readonly clientId?: string;

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

  @ClassField(() => InventoryReceiptItemReqDto, { each: true, minItems: 1 })
  readonly items!: InventoryReceiptItemReqDto[];
}
