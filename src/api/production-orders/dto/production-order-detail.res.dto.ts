import { Exclude, Expose } from 'class-transformer';

import { ProductionOrderStatus } from '../../../database/schemas';
import {
  ClassField,
  DateFieldOptional,
  EnumField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderRefResDto } from '../../orders/dto/order-ref.res.dto';
import { ProductionOrderItemResDto } from './production-order-item.res.dto';

@Exclude()
export class ProductionOrderDetailResDto {
  @Expose()
  @UUIDField({ description: 'Production order id' })
  id!: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã LSX — null cho tới khi duyệt (APPROVED)',
  })
  code!: string | null;

  @Expose()
  @EnumField(() => ProductionOrderStatus)
  status!: ProductionOrderStatus;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Thời điểm duyệt LSX — null khi còn PENDING (kể cả sau khi huỷ duyệt)',
  })
  approvedAt!: Date | null;

  @Expose()
  @ClassField(() => OrderRefResDto)
  order!: OrderRefResDto;

  @Expose()
  @ClassField(() => ProductionOrderItemResDto, { each: true })
  items!: ProductionOrderItemResDto[];
}
