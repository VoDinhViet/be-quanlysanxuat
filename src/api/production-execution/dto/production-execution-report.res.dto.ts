import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductionJobBomItemResDto } from '../../production-jobs/dto/production-job-bom-operation.res.dto';
import { ProductionJobOperationRefResDto } from '../../production-jobs/dto/production-job-operation-ref.res.dto';
import { FileResDto } from '../../files/dto/file.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class ProductionExecutionReportBomItemRefResDto extends PickType(
  ProductionJobBomItemResDto,
  ['id', 'code', 'name'] as const,
) {}

@Exclude()
export class ProductionExecutionReportResDto {
  @Expose()
  @UUIDField({ description: 'ID báo cáo' })
  id!: string;

  @Expose()
  @UUIDField({ description: 'ID công đoạn của Job' })
  productionJobOperationId!: string;

  @Expose()
  @ClassField(() => ProductionJobOperationRefResDto)
  operation!: ProductionJobOperationRefResDto;

  @Expose()
  @ClassField(() => ProductionExecutionReportBomItemRefResDto)
  bomItem!: ProductionExecutionReportBomItemRefResDto;

  @Expose()
  @NumberField({ description: 'SL hoàn thành (đạt) tăng thêm' })
  completedQuantityDelta!: number;

  @Expose()
  @NumberField({ description: 'SL không đạt (NG) tăng thêm' })
  rejectedQuantityDelta!: number;

  @Expose()
  @DateField({ description: 'Ngày hoàn thành ghi nhận' })
  completedDate!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú báo cáo' })
  note!: string | null;

  @Expose()
  @DateField({ description: 'Thời điểm tạo báo cáo' })
  createdAt!: Date;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, {
    nullable: true,
    description: 'Người báo cáo',
  })
  creator!: UserRefResDto | null;

  @Expose()
  @ClassField(() => FileResDto, {
    each: true,
    description: 'Danh sách ảnh minh chứng',
  })
  files!: FileResDto[];
}
