import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import { ClientBaseResDto } from '../../clients/dto/client-base.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { OrderBaseResDto } from '../../orders/dto/order-base.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
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
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassFieldOptional(() => UnitRefResDto, { nullable: true })
  unit!: UnitRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Phiên bản (revision)' })
  revision?: string;

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
  @DateFieldOptional({
    nullable: true,
    description:
      'Lần cuối BOM/công đoạn/vật tư được chụp từ sản phẩm (null = Job cũ chưa snapshot)',
  })
  snapshotLoadedAt!: Date | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Lần cuối vật tư của Job bị sửa tay (null = nguyên bản từ sản phẩm)',
  })
  snapshotEditedAt!: Date | null;

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
  @NumberField({
    description:
      'SL thành phẩm đã hoàn thành ở công đoạn cuối mà chưa xin OQC (trừ lô SCRAP) — 0 thì nút "Yêu cầu OQC" khoá lại',
  })
  oqcRequestableQuantity!: number;

  @Expose()
  @DateField({ description: 'Thời điểm tạo Job' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Thời điểm cập nhật gần nhất' })
  updatedAt!: Date;
}
