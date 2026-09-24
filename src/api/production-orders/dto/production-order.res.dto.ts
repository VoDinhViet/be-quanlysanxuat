import { Exclude, Expose } from 'class-transformer';

import { ProductionOrderStatus } from '../../../database/schemas';
import { OrderBaseResDto } from '../../orders/dto/order-base.res.dto';
import {
  ClassField,
  EnumField,
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
  @ClassField(() => OrderBaseResDto)
  order!: OrderBaseResDto;

  @Expose()
  @EnumField(() => ProductionOrderStatus)
  status!: ProductionOrderStatus;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú của chính LSX — khác `note` (ghi chú đơn hàng gốc)',
  })
  productionOrderNote!: string | null;
}
