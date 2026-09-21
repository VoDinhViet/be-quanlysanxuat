import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderItemRefResDto } from '../../orders/dto/order-item-ref.res.dto';

@Exclude()
export class PurchaseRequestItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OrderItemRefResDto)
  item!: OrderItemRefResDto;

  @Expose()
  @NumberField({
    description:
      'Phần thiếu chốt lúc start Job (requiredQty − onHand tại thời điểm đó), không phải toàn bộ nhu cầu',
  })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'Tồn hiện tại (gộp mọi kho), đọc lúc gọi API' })
  onHand!: number;

  @Expose()
  @NumberField({
    description:
      'Nhu cầu BOM — tổng requiredQty của Job liên quan, hoặc mọi Job của LSX nếu không có Job cụ thể',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({ description: 'Tồn khả dụng = onHand − bomDemand, có thể âm' })
  available!: number;

  @Expose()
  @NumberField({
    description:
      'Phần tồn thực tế bị nhu cầu LSX này chiếm = min(onHand, bomDemand)',
  })
  fromStock!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú riêng của dòng vật tư này',
  })
  note!: string | null;
}
