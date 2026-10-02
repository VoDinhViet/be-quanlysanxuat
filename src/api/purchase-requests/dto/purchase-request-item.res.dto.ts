import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  ClassField,
  DateFieldOptional,
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
      'Phần thiếu chốt lúc start Job (requiredQty − tồn khả dụng tại thời điểm đó, kẹp về 0), không phải toàn bộ nhu cầu',
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
  @NumberField({
    description:
      'Tồn khả dụng của hệ thống (cùng công thức màn Tồn kho vật tư), có thể âm',
  })
  available!: number;

  @Expose()
  @NumberField({
    description:
      'Phần nhu cầu LSX này đã được tồn kho đáp ứng, chốt lúc start Job (không đổi khi sửa quantity); dòng tạo tay là 0',
  })
  fromStock!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú riêng của dòng vật tư này',
  })
  note!: string | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm đánh dấu huỷ/không mua (null nghĩa là mua)',
  })
  cancelledAt!: Date | null;

  @Expose()
  @BooleanField({
    description: 'true: Mua hàng, false: Đã đánh dấu không mua',
  })
  get requiresPurchase(): boolean {
    return !this.cancelledAt;
  }
}
