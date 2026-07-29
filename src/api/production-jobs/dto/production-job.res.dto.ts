import { Exclude, Expose } from 'class-transformer';

import { OrderClientRefResDto } from '../../orders/dto/order-client-ref.res.dto';
import { OrderCreatorResDto } from '../../orders/dto/order-creator.res.dto';
import { OrderItemProductRefResDto } from '../../orders/dto/order-item-product-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * Một Job sản xuất — `GET /production-jobs`/`GET /production-jobs/:jobId`, menu "Quản lý sản
 * xuất". 1 sản phẩm (FG) = 1 Job trong một LSX; `quantity` đã gộp mọi dòng PO cùng sản phẩm (xem
 * `production_jobs` trong `src/database/schemas/production.ts`).
 */
@Exclude()
export class ProductionJobResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Job code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Mã LSX cha' })
  productionOrderCode!: string;

  @Expose()
  @UUIDField({ description: 'Source order id' })
  orderId!: string;

  @Expose()
  @StringField({ description: 'Source order code' })
  orderCode!: string;

  @Expose()
  @ClassFieldOptional(() => OrderClientRefResDto, { nullable: true })
  client!: OrderClientRefResDto | null;

  @Expose()
  @ClassField(() => OrderItemProductRefResDto)
  product!: OrderItemProductRefResDto;

  @Expose()
  @NumberField({ description: 'SL cần sản xuất — đã gộp theo sản phẩm' })
  quantity!: number;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  issuer!: OrderCreatorResDto | null;

  @Expose()
  @DateField({ description: 'Thời điểm "Tạo LSX"' })
  issuedAt!: Date;
}
