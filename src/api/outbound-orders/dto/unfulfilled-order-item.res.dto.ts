import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { OrderRefResDto } from '../../orders/dto/order-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class UnfulfilledOrderItemResDto {
  @Expose()
  @UUIDField({
    description: 'Dòng PO nguồn — gửi lại chính id này khi lập phiếu DO',
  })
  orderItemId!: string;

  @Expose()
  @ClassField(() => ClientRefResDto)
  client!: ClientRefResDto;

  @Expose()
  @ClassField(() => OrderRefResDto)
  order!: OrderRefResDto;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  job!: ProductionJobRefResDto | null;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL đặt của dòng PO' })
  orderedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã xuất kho luỹ kế của dòng PO' })
  issuedQuantity!: number;

  @Expose()
  @NumberField({ description: 'Tồn kho hiện tại của thành phẩm (mọi kho)' })
  onHandQuantity!: number;

  @Expose()
  @NumberField({
    description:
      'Đã giữ chỗ bởi DO khác đang DRAFT/PENDING_APPROVAL/PENDING_DELIVERY',
  })
  heldQuantity!: number;

  @Expose()
  @NumberField({ description: 'Có thể giao = Tồn TP − Đã giữ' })
  availableQuantity!: number;
}
