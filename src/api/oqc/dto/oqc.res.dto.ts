import { Exclude, Expose } from 'class-transformer';

import {
  IqcInspectionLevel,
  IqcResult,
  OqcDisposition,
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
  @StringField({ description: 'Mã công đoạn (snapshot lúc tạo)' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn (snapshot lúc tạo)' })
  operationName!: string;

  @Expose()
  @StringField({ description: 'Mã part (snapshot BOM của Job)' })
  partCode!: string;

  @Expose()
  @StringField({ description: 'Tên chi tiết (snapshot BOM của Job)' })
  partName!: string;

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
  @StringFieldOptional({
    nullable: true,
    description: 'Code letter tra từ bảng AQL, không lưu cột riêng',
  })
  codeLetter!: string | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description:
      'Cỡ mẫu (n) tra từ bảng AQL — auto-suggest, không phải giá trị đã lưu',
  })
  suggestedSampleSize!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Cỡ mẫu đã lưu',
  })
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
  @EnumFieldOptional(() => IqcResult, {
    nullable: true,
    description:
      'Kết quả server tự suy từ Ac/Re — mốc so sánh khi QC ghi đè result',
  })
  resultAuto!: IqcResult | null;

  @Expose()
  @EnumFieldOptional(() => IqcResult, {
    nullable: true,
    description: 'Kết quả QC — lấy theo resultAuto nếu QC không ghi đè',
  })
  result!: IqcResult | null;

  @Expose()
  @EnumField(() => OqcStatus)
  status!: OqcStatus;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú kết quả — bắt buộc khi result ghi đè resultAuto',
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

  @Expose()
  @DateField()
  updatedAt!: Date;
}
