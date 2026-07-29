import { Exclude, Expose } from 'class-transformer';

import { ProductionOrderStatus } from '../../../database/schemas';
import { OrderClientRefResDto } from '../../orders/dto/order-client-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductionOrderItemResDto } from './production-order-item.res.dto';

/**
 * `GET /production-orders/:orderId` và response của các lệnh ghi PATCH/`.../issue`. Tab1 là các
 * field ở cấp cao nhất, Tab2 là `items`.
 */
@Exclude()
export class ProductionOrderDetailResDto {
  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã LSX — null khi còn PENDING (chưa "Tạo LSX")',
  })
  code!: string | null;

  @Expose()
  @UUIDField({ description: 'Order id' })
  orderId!: string;

  @Expose()
  @StringField({ description: 'Order code' })
  orderCode!: string;

  @Expose()
  @ClassFieldOptional(() => OrderClientRefResDto, { nullable: true })
  client!: OrderClientRefResDto | null;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @EnumField(() => ProductionOrderStatus)
  status!: ProductionOrderStatus;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm "Tạo LSX"' })
  issuedAt!: Date | null;

  @Expose()
  @ClassField(() => ProductionOrderItemResDto, { each: true })
  items!: ProductionOrderItemResDto[];
}
