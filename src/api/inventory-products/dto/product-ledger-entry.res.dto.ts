import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { InventoryIssueRefResDto } from '../../inventory-issues/dto/inventory-issue-ref.res.dto';
import { InventoryReceiptRefResDto } from '../../inventory-receipts/dto/inventory-receipt-ref.res.dto';
import { OrderRefResDto } from '../../orders/dto/order-ref.res.dto';
import { OutboundOrderRefResDto } from '../../outbound-orders/dto/outbound-order-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

/** Một dòng sổ cái (thẻ kho) của một thành phẩm. Không trả sẵn "loại giao dịch" đã suy diễn — FE tự
 * phân loại từ `quantity` (dấu) + `inventoryReceipt.receiptType`/`inventoryIssue.issueType` (đúng
 * một trong hai luôn có mặt), xem `docs/domains/inventory.md`, mục "Thẻ kho vật chất — item ledger".
 */
@Exclude()
export class ProductLedgerEntryResDto {
  @Expose()
  @UUIDField({ description: 'Id bút toán (inventory_transactions.id)' })
  id!: string;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  transactionDate!: Date;

  @Expose()
  @DateField({ description: 'Thời điểm ghi bút toán' })
  createdAt!: Date;

  @Expose()
  @NumberField({ description: 'Số lượng có dấu — dương là nhập, âm là xuất' })
  quantity!: number;

  @Expose()
  @NumberField({
    description: 'Tồn luỹ kế sau giao dịch này, mọi kho hoặc theo warehouseId',
  })
  balanceAfter!: number;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptRefResDto, { nullable: true })
  inventoryReceipt!: InventoryReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => InventoryIssueRefResDto, { nullable: true })
  inventoryIssue!: InventoryIssueRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => OrderRefResDto, { nullable: true })
  order!: OrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => OutboundOrderRefResDto, { nullable: true })
  outboundOrder!: OutboundOrderRefResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú của chứng từ nguồn',
  })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;
}
