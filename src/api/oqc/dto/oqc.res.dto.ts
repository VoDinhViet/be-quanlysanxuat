import { Exclude, Expose } from 'class-transformer';

import {
  IqcResult,
  OqcDisposition,
  QualityInspectionStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { QcFileResDto } from '../../iqc/dto/qc-file.res.dto';
import { ProductionJobOperationRefResDto } from '../../production-jobs/dto/production-job-operation-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class OqcBomItemResDto {
  @Expose()
  @StringField({ description: 'Mã part (snapshot BOM của Job)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên chi tiết (snapshot BOM của Job)' })
  name!: string;
}

@Exclude()
export class OqcResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã OQC' })
  code!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  productionJob!: ProductionJobRefResDto;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã đơn hàng (PO)' })
  orderCode!: string | null;

  @Expose()
  @ClassField(() => ProductionJobOperationRefResDto)
  operation!: ProductionJobOperationRefResDto;

  @Expose()
  @ClassField(() => OqcBomItemResDto)
  bomItem!: OqcBomItemResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({ description: 'Lot size (SL sản xuất thực tế)' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumFieldOptional(() => IqcResult, { nullable: true })
  result!: IqcResult | null;

  @Expose()
  @EnumField(() => QualityInspectionStatus)
  status!: QualityInspectionStatus;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú kết quả',
  })
  resultNote!: string | null;

  @Expose()
  @EnumFieldOptional(() => OqcDisposition, {
    nullable: true,
    description: 'Cách xử lý khi FAIL',
  })
  disposition!: OqcDisposition | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú xử lý' })
  dispositionNote!: string | null;

  @Expose()
  @ClassField(() => QcFileResDto, { each: true })
  files!: QcFileResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  confirmerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm xác nhận QC' })
  confirmedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  resolverBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm chọn phương án xử lý (disposition)',
  })
  resolvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
