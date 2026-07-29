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

/** Một dòng của `GET /production-orders` — màn hình chính LSX, mỗi dòng một PO đã duyệt. */
@Exclude()
export class ProductionOrderResDto {
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
  @StringFieldOptional({ nullable: true, description: 'orders.note' })
  note!: string | null;
}
