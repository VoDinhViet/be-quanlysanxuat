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
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';
import { OutsourcingOrderProgress } from '../outsourcing-orders.constant';
import { OutsourcingOrderItemResDto } from './outsourcing-order-item.res.dto';

@Exclude()
export class OutsourcingOrderBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài' })
  code!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

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
      'Tiến độ nhận hàng, suy từ status + SL từng dòng — không phải cột DB',
  })
  progress!: OutsourcingOrderProgress;

  @Expose()
  @NumberField({ description: 'Tổng SL gửi mọi dòng' })
  totalQuantity!: number;

  @Expose()
  @ClassField(() => OutsourcingOrderItemResDto, { each: true })
  items!: OutsourcingOrderItemResDto[];

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
