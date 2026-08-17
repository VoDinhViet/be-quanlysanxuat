import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';

@Exclude()
export class OutsourceablePartResDto {
  @Expose()
  @StringField({ description: 'Mã part (snapshot BOM của Job)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên chi tiết (snapshot BOM của Job)' })
  name!: string;
}

@Exclude()
export class OutsourceableOperationSnapshotResDto {
  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  name!: string;
}

/** Một dòng popup "Tìm kiếm part cần gia công" — `productionJobOperationId` là id thật sự cần gửi
 * lại khi tạo dòng OS-OUT (`OutsourcingOrderItemReqDto.productionJobOperationId`), không phải một
 * FK rò rỉ — đây là mục đích chính của route này. */
@Exclude()
export class OutsourceableOperationResDto {
  @Expose()
  @UUIDField()
  productionJobOperationId!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  job!: ProductionJobRefResDto;

  @Expose()
  @ClassField(() => OutsourceablePartResDto)
  part!: OutsourceablePartResDto;

  @Expose()
  @ClassField(() => OutsourceableOperationSnapshotResDto)
  operation!: OutsourceableOperationSnapshotResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @NumberField({ description: 'SL định mức (theo Job) — tính từ cây BOM' })
  plannedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã gửi (OS-OUT trước, POSTED)' })
  sentQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Còn được phép gửi = plannedQuantity − sentQuantity',
  })
  remainingQuantity!: number;
}
