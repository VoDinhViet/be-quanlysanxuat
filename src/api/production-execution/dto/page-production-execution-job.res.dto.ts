import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  JobOperationEvaluation,
  JobOperationProgress,
} from '../production-execution.constant';

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
  @UUIDField({ description: 'Công đoạn của dòng này (operations.id)' })
  operationId!: string;

  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  operationName!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng (PO)' })
  orderCode!: string;

  @Expose()
  @ClassField(() => ProductionExecutionItemRefResDto)
  item!: ProductionExecutionItemRefResDto;

  @Expose()
  @FileField('imageFile', 'Ảnh sản phẩm')
  image!: FileResDto | null;

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
  @DateFieldOptional({
    nullable: true,
    description:
      'Hạn hoàn thành của công đoạn đang chọn — muộn nhất qua mọi Part của Job; null = chưa đặt hạn',
  })
  operationDueDate!: Date | null;

  @Expose()
  @EnumField(() => JobOperationProgress, {
    description: 'Tiến độ công đoạn đang chọn của Job',
  })
  operationStatus!: JobOperationProgress;

  @Expose()
  @EnumFieldOptional(() => JobOperationEvaluation, {
    nullable: true,
    description:
      'Đúng/trễ hạn của công đoạn đã xong; null = chưa xong hoặc không có hạn để so',
  })
  operationEvaluation!: JobOperationEvaluation | null;
}
