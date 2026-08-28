import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { OrderRefResDto } from '../../orders/dto/order-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class OutboundOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OrderRefResDto)
  order!: OrderRefResDto;

  @Expose()
  @UUIDField({
    description: 'Dòng PO nguồn (order_items) — round-trip khi Sửa (BUG-090)',
  })
  orderItemId!: string;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL giao dòng này' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú dòng' })
  note!: string | null;

  @Expose()
  @NumberField({ description: 'SL đặt của dòng PO nguồn' })
  orderedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã xuất kho luỹ kế của dòng PO nguồn' })
  issuedQuantity!: number;

  @Expose()
  @NumberField({ description: 'Tồn kho hiện tại của thành phẩm (mọi kho)' })
  onHandQuantity!: number;

  @Expose()
  @NumberField({
    description:
      'Đã giữ chỗ bởi DO khác đang DRAFT/PENDING_APPROVAL/PENDING_DELIVERY — không tính phiếu này',
  })
  heldQuantity!: number;

  @Expose()
  @NumberField({ description: 'Có thể giao = Tồn TP − Đã giữ' })
  availableQuantity!: number;
}
