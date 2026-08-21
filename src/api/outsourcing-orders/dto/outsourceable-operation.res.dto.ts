import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';

@Exclude()
export class OutsourceableBomItemResDto {
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
  @UUIDFieldOptional({
    nullable: true,
    description:
      'Công đoạn danh mục (operations) — null nếu snapshot mất liên kết',
  })
  operationId!: string | null;

  @Expose()
  @StringField({ description: 'Mã công đoạn (snapshot)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn (snapshot)' })
  name!: string;
}

/** Một dòng popup "chọn part cần gia công" — `productionJobOperationId`/`itemId`/`job.id`/
 * `operation.*` là đúng bộ giá trị client gửi lại khi tạo dòng OS-OUT
 * (`OutsourcingOrderItemReqDto`); `bomItem`/`unit` chỉ để hiển thị. Cùng khuôn popup OQC
 * (`InspectableOperationResDto`) nhưng mốc so sánh khác: đây là SL gửi gia công, không phải tiến
 * độ QC. */
@Exclude()
export class OutsourceableOperationResDto {
  @Expose()
  @UUIDField()
  productionJobOperationId!: string;

  @Expose()
  @UUIDField({ description: 'Mặt hàng WIP của công đoạn trên' })
  itemId!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  job!: ProductionJobRefResDto;

  @Expose()
  @ClassField(() => OutsourceableBomItemResDto)
  bomItem!: OutsourceableBomItemResDto;

  @Expose()
  @ClassField(() => OutsourceableOperationSnapshotResDto)
  operation!: OutsourceableOperationSnapshotResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @NumberField({
    description: 'SL định mức (theo Job) — đóng băng lúc duyệt LSX',
  })
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
