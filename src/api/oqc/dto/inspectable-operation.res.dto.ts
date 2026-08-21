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
export class InspectableBomItemResDto {
  @Expose()
  @StringField({ description: 'Mã part (snapshot BOM của Job)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên chi tiết (snapshot BOM của Job)' })
  name!: string;
}

@Exclude()
export class InspectableOperationSnapshotResDto {
  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  name!: string;
}

/** Một dòng popup "Yêu cầu QC" — `productionJobOperationId` là id thật sự cần gửi lại khi tạo OQC
 * (`CreateOqcReqDto.productionJobOperationId`). Khác popup OS-OUT (`OutsourceableOperationResDto`)
 * ở mốc so sánh: đây là tiến độ QC (`completedQuantity` xưởng báo hoàn thành so với
 * `inspectedQuantity` đã xin QC), không phải SL gửi gia công. */
@Exclude()
export class InspectableOperationResDto {
  @Expose()
  @UUIDField()
  productionJobOperationId!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  job!: ProductionJobRefResDto;

  @Expose()
  @ClassField(() => InspectableBomItemResDto)
  bomItem!: InspectableBomItemResDto;

  @Expose()
  @ClassField(() => InspectableOperationSnapshotResDto)
  operation!: InspectableOperationSnapshotResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @NumberField({ description: 'SL đã hoàn thành công đoạn (xưởng tự báo)' })
  completedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã xin QC (trừ dòng SCRAP)' })
  inspectedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Còn được phép xin QC = completedQuantity − inspectedQuantity',
  })
  remainingQuantity!: number;
}
