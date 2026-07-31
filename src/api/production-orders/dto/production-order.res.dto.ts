import { Exclude, Expose } from 'class-transformer';

import { ProductionOrderStatus } from '../../../database/schemas';
import { OrderClientRefResDto } from '../../orders/dto/order-client-ref.res.dto';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionOrderResDto {
  @Expose()
  @UUIDField({
    description:
      'Production order id — dùng cho GET /production-orders/:productionOrdersId',
  })
  id!: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã LSX — null cho tới khi duyệt (APPROVED)',
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
  @StringFieldOptional({ nullable: true, description: 'orders.note' })
  note!: string | null;
}
