import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import {
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
  @UUIDField({ description: 'Id sản phẩm (FG)' })
  productId!: string;

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
