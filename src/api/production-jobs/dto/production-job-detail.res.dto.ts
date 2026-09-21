import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import { ClientBaseResDto } from '../../clients/dto/client-base.res.dto';
import { ItemUnitField } from '../../items/dto/item-unit.field';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { OrderBaseResDto } from '../../orders/dto/order-base.res.dto';
import {
  BooleanField,
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
  itemId!: string;

  @Expose()
  @ItemUnitField()
  item!: ItemUnitRefResDto;

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
  @UUIDFieldOptional({ nullable: true, description: 'Ai duyệt công đoạn' })
  operationsApprovedBy!: string | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Thời điểm duyệt công đoạn — route ghi trường này (POST .../approve-operations) đã xoá, giữ lại cho dữ liệu cũ',
  })
  operationsApprovedAt!: Date | null;

  @Expose()
  @BooleanField({
    description:
      'Job này đã có phiếu OQC (Cấp 0) hay chưa — true thì nút "Yêu cầu OQC" khoá lại',
  })
  oqcRequested!: boolean;

  @Expose()
  @DateField({ description: 'Thời điểm tạo Job' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Thời điểm cập nhật gần nhất' })
  updatedAt!: Date;
}
