import { Exclude, Expose, Type } from 'class-transformer';
import {
  BooleanField,
  DateFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class JobOperationProgressItemDto {
  @Expose()
  @NumberField({ int: true, description: 'Thứ tự công đoạn' })
  stepIndex!: number;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  operationName!: string;

  @Expose()
  @StringField({ description: 'Trạng thái công đoạn: PENDING, IN_PROGRESS, COMPLETED, PAUSED' })
  status!: string;

  @Expose()
  @NumberFieldOptional({ description: 'Số lượng đã hoàn thành' })
  completedQuantity?: number;

  @Expose()
  @NumberFieldOptional({ description: 'Số lượng lỗi / phế phẩm' })
  defectQuantity?: number;

  @Expose()
  @BooleanField({ description: 'Có phải công đoạn gia công ngoài không' })
  isOutsourcing!: boolean;
}

@Exclude()
export class TrackJobResDto {
  @Expose()
  @StringField({ description: 'Mã Job (Lệnh sản xuất)' })
  jobCode!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng gốc (Production Order Code)' })
  orderCode!: string;

  @Expose()
  @StringField({ description: 'Tên sản phẩm' })
  itemName!: string;

  @Expose()
  @NumberField({ description: 'Số lượng sản xuất cần đạt' })
  targetQuantity!: number;

  @Expose()
  @StringField({ description: 'Trạng thái Job hiện tại' })
  status!: string;

  @Expose()
  @DateFieldOptional({ description: 'Hạn chót hoàn thành (Due date)' })
  dueDate?: Date | null;

  @Expose()
  @NumberField({ description: 'Tiến độ hoàn thành tổng thể (%)' })
  progressPercentage!: number;

  @Expose()
  @Type(() => JobOperationProgressItemDto)
  operations!: JobOperationProgressItemDto[];
}
