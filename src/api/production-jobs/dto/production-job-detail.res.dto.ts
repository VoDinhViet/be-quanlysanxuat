import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import { ClientBaseResDto } from '../../clients/dto/client-base.res.dto';
import { OrderBaseResDto } from '../../orders/dto/order-base.res.dto';
import { ProductRefResDto } from '../../products/dto/product-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobDetailResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Job code' })
  code!: string;

  @Expose()
  @UUIDField({ description: 'Id LSX cha' })
  productionOrderId!: string;

  @Expose()
  @ClassField(() => OrderBaseResDto)
  order!: OrderBaseResDto;

  @Expose()
  @ClassFieldOptional(() => ClientBaseResDto, { nullable: true })
  client!: ClientBaseResDto | null;

  @Expose()
  @UUIDField({ description: 'Id sản phẩm (FG)' })
  productId!: string;

  @Expose()
  @ClassField(() => ProductRefResDto, { description: 'Sản phẩm (FG)' })
  product!: ProductRefResDto;

  @Expose()
  @NumberField({ description: 'SL cần sản xuất — đã gộp theo sản phẩm' })
  quantity!: number;

  @Expose()
  @EnumField(() => ProductionJobStatus, { description: 'Trạng thái Job' })
  status!: ProductionJobStatus;

  @Expose()
  @UUIDFieldOptional({ nullable: true, description: 'Ai bấm start' })
  startedBy!: string | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm bắt đầu sản xuất',
  })
  startedAt!: Date | null;

  @Expose()
  @DateField({ description: 'Thời điểm tạo Job' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Thời điểm cập nhật gần nhất' })
  updatedAt!: Date;
}
