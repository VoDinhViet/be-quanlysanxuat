import { Exclude, Expose } from 'class-transformer';

import {
  InventoryDocumentStatus,
  InventoryReceiptAssetType,
  InventoryReceiptType,
} from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { PurchaseOrderRefResDto } from '../../purchase-orders/dto/purchase-order-ref.res.dto';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';
import { InventoryReceiptItemResDto } from './inventory-receipt-item.res.dto';

@Exclude()
export class InventoryReceiptResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @EnumField(() => InventoryReceiptType)
  receiptType!: InventoryReceiptType;

  @Expose()
  @EnumField(() => InventoryReceiptAssetType)
  assetType!: InventoryReceiptAssetType;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @BooleanField()
  requiresIqc!: boolean;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  receiptDate!: Date;

  @Expose()
  @ClassFieldOptional(() => SupplierRefResDto, { nullable: true })
  supplier!: SupplierRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ClientRefResDto, {
    nullable: true,
    description:
      'Khách hàng gửi trả — chỉ có khi receiptType=RETURN gắn khách hàng',
  })
  client!: ClientRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => PurchaseRequestRefResDto, { nullable: true })
  purchaseRequest!: PurchaseRequestRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderRefResDto, { nullable: true })
  purchaseOrder!: PurchaseOrderRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptItemResDto, { each: true })
  items!: InventoryReceiptItemResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  postedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
