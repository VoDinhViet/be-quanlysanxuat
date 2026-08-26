import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { JobOperationProgress } from '../production-execution.constant';

@Exclude()
export class ProductionExecutionItemRefResDto {
  @Expose()
  @StringField({ description: 'Mã sản phẩm' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên sản phẩm' })
  name!: string;
}

@Exclude()
export class PageProductionExecutionJobResDto {
  @Expose()
  @UUIDField({ description: 'Job id' })
  jobId!: string;

  @Expose()
  @StringField({ description: 'Mã Job' })
  jobCode!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng (PO)' })
  orderCode!: string;

  @Expose()
  @ClassField(() => ProductionExecutionItemRefResDto)
  item!: ProductionExecutionItemRefResDto;

  @Expose()
  @NumberField({ description: 'SL cần sản xuất' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @EnumField(() => ProductionJobStatus, { description: 'Trạng thái Job' })
  jobStatus!: ProductionJobStatus;

  @Expose()
  @NumberField({
    description:
      'Định mức (pcs) — SUM qua mọi Part của Job có công đoạn đang chọn',
  })
  plannedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã hoàn thành (đạt) — SUM qua mọi Part' })
  completedQuantity!: number;

  @Expose()
  @NumberField({ description: 'SL không đạt (NG) — SUM qua mọi Part' })
  rejectedQuantity!: number;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Ngày hoàn thành công đoạn — chỉ có khi mọi Part của Job đã xong ở công đoạn đang chọn',
  })
  operationCompletedDate!: Date | null;

  @Expose()
  @EnumField(() => JobOperationProgress, {
    description: 'Tiến độ công đoạn đang chọn của Job',
  })
  operationStatus!: JobOperationProgress;
}
