import { Exclude, Expose } from 'class-transformer';

import {
  ProductionOrderSourceType,
  ProductionOrderStatus,
} from '../../../database/schemas';
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
  @EnumField(() => ProductionOrderSourceType, {
    description: 'ORDER = LSX từ đơn hàng, NCR = LSX phụ sửa chữa / làm mới',
  })
  sourceType!: ProductionOrderSourceType;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã NCR nguồn — chỉ có với LSX phụ (sourceType = NCR)',
  })
  ncrCode!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú của chính LSX — khác `note` (ghi chú đơn hàng gốc)',
  })
  productionOrderNote!: string | null;
}
