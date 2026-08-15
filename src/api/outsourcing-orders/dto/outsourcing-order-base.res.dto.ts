import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';
import { OutsourcingOrderProgress } from '../outsourcing-orders.constant';

@Exclude()
export class OutsourcingOrderBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài' })
  code!: string;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL gửi' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhận (Σ OS-IN POSTED)' })
  receivedQuantity!: number;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @StringField({ description: 'Mã công đoạn (snapshot lúc gửi)' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn (snapshot lúc gửi)' })
  operationName!: string;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày hẹn về' })
  expectedReturnDate!: Date | null;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @EnumField(() => OutsourcingOrderProgress, {
    description:
      'Tiến độ nhận hàng, suy từ status + receivedQuantity — không phải cột DB',
  })
  progress!: OutsourcingOrderProgress;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

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
