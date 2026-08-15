import { Exclude, Expose } from 'class-transformer';

import {
  IqcInspectionLevel,
  IqcResult,
  OqcStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class OqcResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã OQC' })
  code!: string;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã đơn hàng (PO)' })
  orderCode!: string | null;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'Lot size (SL sản xuất thực tế)' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumFieldOptional(() => IqcInspectionLevel, { nullable: true })
  inspectionLevel!: IqcInspectionLevel | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Mức AQL (%)' })
  aqlLevel!: number | null;

  @Expose()
  @NumberFieldOptional({ int: true, nullable: true, description: 'Cỡ mẫu' })
  sampleSize!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lượng lỗi đếm được trong mẫu',
  })
  defectQty!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lỗi chấp nhận (Ac) — tra từ bảng AQL, không lưu cột riêng',
  })
  ac!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lỗi từ chối (Re) — tra từ bảng AQL, không lưu cột riêng',
  })
  re!: number | null;

  @Expose()
  @EnumFieldOptional(() => IqcResult, { nullable: true })
  result!: IqcResult | null;

  @Expose()
  @EnumField(() => OqcStatus)
  status!: OqcStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú kết quả' })
  resultNote!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  confirmerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm xác nhận QC' })
  confirmedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
